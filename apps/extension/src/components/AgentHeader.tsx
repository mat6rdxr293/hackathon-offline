import { Stethoscope } from 'lucide-react';

import { AGENT_NAME } from '../app/agent';
import { StatusBadge } from './StatusBadge';

type Props = {
  status: import('@hackathon/shared').UIStatus;
  statusLabel: string;
  subtitle: string;
};

export const AgentHeader = ({ status, statusLabel, subtitle }: Props) => (
  <div
    className="flex items-center justify-between rounded-2xl px-3 py-2.5"
    style={{
      background: '#102620',
      border: '1px solid #1E2C31',
      boxShadow: 'rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(255,255,255,0.03) 0px 1px 0px inset',
    }}
  >
    <div className="flex items-center gap-2.5">
      <div
        className="rounded-xl p-2"
        style={{ background: 'rgba(54,244,164,0.12)', color: '#36F4A4' }}
      >
        <Stethoscope size={16} />
      </div>
      <div>
        <h1 className="text-sm font-semibold leading-tight" style={{ color: '#FFFFFF' }}>{AGENT_NAME}</h1>
        <p className="text-xs" style={{ color: '#71717A' }}>{subtitle}</p>
      </div>
    </div>
    <StatusBadge status={status} label={statusLabel} />
  </div>
);
