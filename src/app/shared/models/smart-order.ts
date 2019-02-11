import { Order } from './order';

export interface SmartOrder extends Order {
    splits?: number;
    positionCount?: number;
    timeSubmitted?: number;
    signalTime?: number;
    lossThreshold?: number;
    profitTarget?: number;
    useStopLoss?: boolean;
    useTakeProfit?: boolean;
    meanReversion1?: boolean;
    useMfi?: boolean;
    spyMomentum?: boolean;
    yahooData?: boolean;
    orderSize?: number;
    triggered?: boolean;
    triggeredBacktest?: boolean;
    init?: boolean;
    stepForward?: number;
}
