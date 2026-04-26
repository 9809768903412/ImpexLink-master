import { Phone, Mail, MessageSquareMore } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ClientSupportFooterProps {
  phone?: string;
  email?: string;
}

const defaultFaqs = [
  {
    id: 'faq-1',
    question: 'How long does quotation processing usually take?',
    answer: 'Most quotation requests are reviewed within 24 hours during business days. Complex project requirements may take a little longer.',
  },
  {
    id: 'faq-2',
    question: 'Can I upload my own project or purchase order file?',
    answer: 'Yes. Use Request Quotation and attach your project brief, bill of materials, or purchase order file so our team can review it.',
  },
  {
    id: 'faq-3',
    question: 'Where can I track my orders and deliveries?',
    answer: 'Open My Orders to view order details, payment status, and the linked delivery timeline in one place.',
  },
];

export default function ClientSupportFooter({
  phone = '+63 2 8123 4567',
  email = 'sales@impex.ph',
}: ClientSupportFooterProps) {
  return (
    <div className="mt-10 space-y-4">
      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-primary">Need help with your order or quotation?</p>
            <p className="text-sm text-muted-foreground">
              Our team can walk you through pricing, project requirements, and delivery concerns.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Phone size={16} />
              Call Us
            </a>
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Mail size={16} />
              Email Support
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareMore size={18} />
            FAQs
          </CardTitle>
          <CardDescription>Quick answers for common client questions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {defaultFaqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
