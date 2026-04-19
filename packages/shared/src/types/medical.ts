export type MedicalData = {
  complaints: string;
  anamnesis: string;
  objectiveStatus: string;
  recommendations: string;
  notes: string;
  registrationDate?: string;
  recordType?: string;
};

export type MedicalParseResult = {
  data: MedicalData;
  confidence: number;
  source: 'heuristic' | 'provider' | 'hybrid';
};
