import { Heading } from '@eticart/ui';
import { NewTicketForm } from './NewTicketForm';

export default function NewTicketPage() {
  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Heading level={1}>Yeni Destek Talebi</Heading>
        <p style={{ color: '#6b7280' }}>
          Detaylı açıklama, hızlı yanıt almanıza yardımcı olur.
        </p>
      </div>
      <NewTicketForm />
    </div>
  );
}
