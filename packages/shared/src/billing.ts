/** Price is an integer number of fen; the server never accepts a client price. */
export const REVIEW_PRICE_FEN = 188;
export const REVIEW_PRICE_LABEL = '¥1.88';
export interface WechatPaymentParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}
export interface BillingStatus {
  enabled: boolean;
  priceFen: number;
  credits: number;
  supportContact: string;
  orders: { id: string; status: string; createdAt: number }[];
  recoverableJobId?: string;
}
