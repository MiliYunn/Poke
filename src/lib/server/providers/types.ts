export type Source = { provider: string; chainId: number; fetchedAt: string };
export type Balance = { chainId: number; symbol: string; amount: string; usdValue?: number; source: Source };
export interface PortfolioProvider { getNativeBalance(address: string, chainId: number): Promise<Balance>; getTokenBalances(address: string, chainId: number): Promise<Balance[]>; }
export interface HandleResolver { namespace: string; supports(input: string): boolean; resolve(input: string): Promise<string>; }
