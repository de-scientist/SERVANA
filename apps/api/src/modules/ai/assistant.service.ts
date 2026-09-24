import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AIService } from './ai.service';
import { MatchingService } from './matching.service';
import { screenInjection } from './guardrails';

export type AssistantIntent =
  | 'search'
  | 'compare'
  | 'explain_recommendation'
  | 'explain_booking'
  | 'support_faq'
  | 'booking_action'
  | 'greeting'
  | 'unknown';

export interface AssistantReply {
  intent: AssistantIntent;
  message: string;
  data?: Record<string, unknown>;
  /** Irreversible actions are NEVER executed: the client confirms via real endpoints. */
  confirmationRequired?: {
    action: 'booking.create' | 'payment.initiate' | 'booking.cancel';
    params: Record<string, unknown>;
    message: string;
  };
}

const FAQ: Array<{ match: RegExp; answer: string }> = [
  {
    match: /\b(cancel|cancellation|refund policy)\b/i,
    answer:
      'You can cancel free of charge up to 24 hours before your appointment from My bookings. Paid bookings cancelled in time are refunded to your original payment method.',
  },
  {
    match: /\b(refund|money back|reimburs)/i,
    answer:
      'Refunds go back to your original payment method once approved. You can track the status on your booking — if it says REFUNDED, the money is on its way.',
  },
  {
    match: /\b(pay|payment|m-pesa|mpesa|paybill)\b/i,
    answer:
      'We accept M-Pesa, cards and bank transfer. You only pay when you check out — the amount is confirmed before anything moves.',
  },
  {
    match: /\b(points|loyalty|reward|tier)\b/i,
    answer:
      'You earn 20 points per booking, 5 per review and 50 per successful referral. Track your balance and redeem rewards on the Rewards page.',
  },
  {
    match: /\b(review|rating|stars?)\b/i,
    answer:
      'After a completed service you can rate Quality, Professionalism, Communication, Punctuality and Value. Only verified appointments can be reviewed.',
  },
  {
    match: /\b(human|agent|support|contact|help|complaint)\b/i,
    answer:
      'For anything I cannot resolve, message your provider from the booking, or report a conversation and our support team will step in.',
  },
];

function classifyIntent(text: string): AssistantIntent {
  const q = text.toLowerCase();
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|niaje|sasa)\b/.test(q) && q.length < 30) return 'greeting';
  if (/\b(cancel|refund)\b.*\b(booking|appointment|order)\b|\bcancel my\b/i.test(text)) return 'booking_action';
  if (/\b(book|pay|checkout)\b/i.test(text) && /\b(confirm|proceed|yes|pay now|book now|book it)\b/i.test(text)) {
    return 'booking_action';
  }
  if (/\b(compare|difference between|better|versus|\bvs\b)/i.test(text)) return 'compare';
  if (/\bwhy\b.*\b(recommend|suggest|pick|choose)/i.test(text)) return 'explain_recommendation';
  if (/\b(my booking|my appointment|booking status|where is my|order status|what.*status)\b/i.test(text)) {
    return 'explain_booking';
  }
  if (FAQ.some((f) => f.match.test(text))) return 'support_faq';
  if (/\b(find|need|want|looking for|search|show me|recommend|suggest|book|price|cost|near|available)\b/i.test(text)) {
    return 'search';
  }
  return 'unknown';
}

/**
 * Customer assistant: understands requests, searches the real marketplace,
 * compares providers from evidence, explains the customer's own bookings and
 * answers support FAQs. Irreversible actions (booking, payment, cancellation)
 * ALWAYS return a confirmation payload — the assistant never executes them.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AIService,
    private readonly matching: MatchingService,
  ) {}

  async chat(
    userId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<AssistantReply> {
    const cleanHistory = history.slice(-10).map((h) => ({
      role: h.role,
      content: h.content.slice(0, 2000),
    }));
    void cleanHistory;

    // Safety screen first (AIService re-screens LLM-bound text; this guards router paths too).
    const screen = screenInjection(message);
    if (screen.flagged) {
      await this.audit.record({
        actorId: userId, action: 'assistant.blocked', entity: 'assistant', entityId: userId,
        after: { categories: screen.categories },
      });
      return {
        intent: 'unknown',
        message: 'I cannot help with that request. Try asking about services, bookings or support topics.',
      };
    }

    this.ai.checkRateLimit(userId, 'assistant-chat');

    const intent = classifyIntent(message);
    let reply: AssistantReply;
    switch (intent) {
      case 'search':
        reply = await this.handleSearch(userId, message);
        break;
      case 'compare':
        reply = await this.handleCompare(userId, message);
        break;
      case 'explain_booking':
        reply = await this.handleExplainBooking(userId, message);
        break;
      case 'support_faq':
        reply = this.handleFaq(message);
        break;
      case 'booking_action':
        reply = this.handleBookingAction(message);
        break;
      case 'greeting':
        reply = {
          intent,
          message:
            'Hello! Tell me what beauty service you need — for example "braids on Saturday in Kileleshwa under 2500" — and I will find verified providers.',
        };
        break;
      case 'explain_recommendation':
        reply = {
          intent,
          message:
            'Tell me which provider you mean (paste their name), and I will show the exact ratings, jobs and verification behind the suggestion.',
        };
        break;
      default:
        reply = {
          intent: 'unknown',
          message:
            'I can search services, compare providers, explain your bookings, or answer support questions. What would you like to do?',
        };
    }

    await this.audit.record({
      actorId: userId, action: 'assistant.chat', entity: 'assistant', entityId: userId,
      after: { intent: reply.intent },
    });
    return reply;
  }

  private async handleSearch(userId: string, message: string): Promise<AssistantReply> {
    const matched = await this.matching.match(userId, message, 3);
    if (!matched.results.length) {
      return {
        intent: 'search',
        message: `I understood${matched.criteria.service ? ` you want ${matched.criteria.service}` : ''}${
          matched.criteria.location ? ` near ${matched.criteria.location}` : ''
        }${matched.criteria.budget != null ? ` under KES ${matched.criteria.budget.toLocaleString()}` : ''}, but no verified providers match right now. Try widening the budget or area.`,
        data: { criteria: matched.criteria },
      };
    }
    const lines = matched.results.map(
      (r, i) =>
        `${i + 1}. ${r.businessName ?? 'Provider'} — ${r.serviceName}, KES ${Number(r.priceCents) / 100} (${r.reasons.join(', ')})`,
    );
    return {
      intent: 'search',
      message: `Here is what I found:\n${lines.join('\n')}\n\nReply with "why" plus the provider name and I will show the evidence. Nothing is booked until you confirm.`,
      data: { criteria: matched.criteria, results: matched.results },
    };
  }

  private async handleCompare(userId: string, message: string): Promise<AssistantReply> {
    // Compare = match broadly, then lay the top two side by side with evidence.
    const matched = await this.matching.match(userId, message, 5);
    if (matched.results.length < 2) {
      return {
        intent: 'compare',
        message: 'I need at least two matching providers to compare — try a broader request first.',
        data: { criteria: matched.criteria },
      };
    }
    const [a, b] = matched.results;
    const [ea, eb] = await Promise.all([
      this.matching.explain(userId, 'provider', a.providerId).catch(() => null),
      this.matching.explain(userId, 'provider', b.providerId).catch(() => null),
    ]);
    return {
      intent: 'compare',
      message:
        `${a.businessName ?? 'A'} (score ${a.score}) vs ${b.businessName ?? 'B'} (score ${b.score}).\n` +
        `Price: KES ${Number(a.priceCents) / 100} vs KES ${Number(b.priceCents) / 100}.\n` +
        `Evidence for ${a.businessName ?? 'A'}: ${(ea?.evidence ?? []).slice(0, 2).join(' ')}\n` +
        `Evidence for ${b.businessName ?? 'B'}: ${(eb?.evidence ?? []).slice(0, 2).join(' ')}`,
      data: { a, b, evidenceA: ea, evidenceB: eb },
    };
  }

  private async handleExplainBooking(userId: string, message: string): Promise<AssistantReply> {
    // Latest relevant booking: prefer an explicit reference, else the newest.
    const refMatch = /SVN-[A-Z0-9-]+/i.exec(message);
    const booking = refMatch
      ? await this.prisma.booking.findFirst({
          where: { customerId: userId, reference: refMatch[0].toUpperCase() },
          include: { providerService: { select: { name: true } }, payment: { select: { status: true } } },
        })
      : await this.prisma.booking.findFirst({
          where: { customerId: userId },
          orderBy: { createdAt: 'desc' },
          include: { providerService: { select: { name: true } }, payment: { select: { status: true } } },
        });
    if (!booking) {
      return { intent: 'explain_booking', message: 'You have no bookings yet — search a service and I will help you find one.' };
    }
    const service = (booking as any).providerService?.name ?? 'your service';
    const pay = (booking as any).payment?.status ?? booking.paymentStatus;
    const nextStep =
      booking.status === 'COMPLETED'
        ? ' Done — you can review it from the booking.'
        : ' I can walk you through next steps if you like.';
    return {
      intent: 'explain_booking',
      message:
        `Booking ${booking.reference}: ${service} on ${booking.startsAt.toISOString().slice(0, 16).replace('T', ' ')}. ` +
        `Status is ${booking.status}, payment is ${pay}.${nextStep}`,
      data: { bookingId: booking.id, status: booking.status, paymentStatus: pay },
    };
  }

  private handleFaq(message: string): AssistantReply {
    const hit = FAQ.find((f) => f.match.test(message));
    return {
      intent: 'support_faq',
      message: hit?.answer ?? 'For account or technical issues, our support team responds within one business day.',
    };
  }

  private handleBookingAction(message: string): AssistantReply {
    const q = message.toLowerCase();
    if (q.includes('cancel')) {
      return {
        intent: 'booking_action',
        message:
          'I can prepare the cancellation, but I will never cancel without your explicit confirmation. Confirm the booking reference and I will show you the exact next step.',
        confirmationRequired: {
          action: 'booking.cancel',
          params: {},
          message: 'Please confirm: cancel which booking reference?',
        },
      };
    }
    if (q.includes('pay') || q.includes('checkout')) {
      return {
        intent: 'booking_action',
        message:
          'Payments always need your confirmation showing the exact amount. Tell me which booking and I will prepare the payment summary — you approve it before any money moves.',
        confirmationRequired: {
          action: 'payment.initiate',
          params: {},
          message: 'Please confirm: pay for which booking reference, and I will show the amount first?',
        },
      };
    }
    return {
      intent: 'booking_action',
      message:
        'I found providers for that request but I will not book anything yet. Pick one and confirm the time — then I will prepare the booking for your approval.',
      confirmationRequired: {
        action: 'booking.create',
        params: {},
        message: 'Please confirm: which provider and time should I prepare?',
      },
    };
  }
}
