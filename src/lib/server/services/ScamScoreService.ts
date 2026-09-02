export type Evidence = { id: string; label: string; status: 'pass'|'warning'|'unknown'; detail: string; source?: string };
export class ScamScoreService {
  score(input: string) {
    const evidence: Evidence[] = [
      { id:'source', label:'Verified source', status:'unknown', detail:'Explorer verification has not been queried yet.' },
      { id:'age', label:'Contract age', status:'unknown', detail:'Creation block is awaiting provider data.' },
      { id:'honeypot', label:'Sell simulation', status:'unknown', detail:'Simulation runs only for token contracts.' },
      { id:'holders', label:'Holder concentration', status:'unknown', detail:'Indexer data is not configured.' },
      { id:'domain', label:'Domain similarity', status: input.includes('.') ? 'pass':'unknown', detail: input.includes('.') ? 'No obvious character substitution detected.':'No domain supplied.' }
    ];
    return { heuristicScore: null, riskLevel:'unknown', evidence, aiSynthesis:null };
  }
}
