import type { MedicalData } from '@hackathon/shared';

type StructuredOutputCardProps = {
  data: MedicalData | null;
  title: string;
  emptyLabel: string;
  labels: {
    complaints: string;
    anamnesis: string;
    objectiveStatus: string;
    recommendations: string;
    notes: string;
  };
  emptyValue: string;
};

export const StructuredOutputCard = ({ data, title, emptyLabel, labels, emptyValue }: StructuredOutputCardProps) => {
  if (!data) {
    return (
      <div
        className="rounded-xl p-3 text-xs"
        style={{ border: '1px dashed #1E2C31', color: '#3F3F46' }}
      >
        {emptyLabel}
      </div>
    );
  }

  const fields = [
    { label: labels.complaints, value: data.complaints },
    { label: labels.anamnesis, value: data.anamnesis },
    { label: labels.objectiveStatus, value: data.objectiveStatus },
    { label: labels.recommendations, value: data.recommendations },
    { label: labels.notes, value: data.notes || emptyValue },
  ];

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: '#061A1C',
        border: '1px solid #1E2C31',
        boxShadow: 'rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(255,255,255,0.03) 0px 1px 0px inset',
      }}
    >
      <h3
        className="mb-2 text-xs font-medium uppercase"
        style={{ color: '#52525B', letterSpacing: '0.06em' }}
      >
        {title}
      </h3>
      <div className="space-y-1.5 text-xs">
        {fields.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg px-2.5 py-2"
            style={{ background: '#102620' }}
          >
            <p className="mb-0.5 font-medium" style={{ color: '#52525B' }}>{label}</p>
            <p style={{ color: '#FFFFFF' }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
