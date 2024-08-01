import { getAddress, PrivateKeyAccount } from "viem";
const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

// 0x88203ae440a06f05b2ac27114e19e8641c184356895887b190043a12e56b3763723754010ba6a9934314c4fbfb4ff32ecbb7ceffeb04c7f4ce6f87032f0e9eff1b
const generateABSignatures = async (
  address: any,
  expiration: string | number,
  totalFee: string | number,
  maxFeePerContract: string | number,
  targetContract: string,
  strike: string,
  partialFill: boolean,
  referral: string,
  ts: number,
  isAbove: boolean,

  activeChainId: number,
  routerContract: string,
  wallet: PrivateKeyAccount
): Promise<string> => {
  const domain = {
    name: "Validator",
    version: "1",
    chainId: activeChainId,
    verifyingContract: routerContract,
  };
  const fullSignatureParams = {
    types: {
      EIP712Domain,
      UserTradeSignature: [
        { name: "user", type: "address" },
        { name: "targetContract", type: "address" },
        { name: "expiration", type: "uint32" },
        { name: "totalFee", type: "uint256" },
        { name: "strike", type: "uint256" },
        { name: "isAbove", type: "bool" },
        { name: "maxFeePerContract", type: "uint256" },
        { name: "allowPartialFill", type: "bool" },
        { name: "referralCode", type: "string" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "UserTradeSignature",
    domain,
    message: {
      user: address,
      targetContract: getAddress(targetContract),
      expiration,
      totalFee,
      strike,
      isAbove,
      maxFeePerContract,
      allowPartialFill: partialFill,
      referralCode: referral,
      timestamp: ts,
    },
  };

  const res = await wallet.signTypedData(fullSignatureParams);

  return res;
};
const generateUDSignature = async (
  address: any,
  size: string,
  duration: string | number,
  targetContract: string,
  strike: string,
  slippage: string,
  partialFill: boolean,
  referral: string,
  ts: number,
  settlementFee: string | number,
  isUp: boolean,
  wallet: PrivateKeyAccount,
  activeChainId: any,
  routerContract: string
): Promise<string[]> => {
  const isLimit = settlementFee == 0;

  const baseMessage = {
    user: address,
    totalFee: size,
    period: +duration * 60 + "",
    targetContract,
    strike,
    slippage,
    allowPartialFill: partialFill,
    referralCode: referral,
  };
  const domain = {
    name: "Validator",
    version: "1",
    chainId: activeChainId,
    verifyingContract: routerContract,
  };
  const key = isLimit
    ? { partial: "UserTradeSignature", full: "MarketDirectionSignature" }
    : {
        partial: "UserTradeSignatureWithSettlementFee",
        full: "UserTradeSignatureWithSettlementFee",
      };
  const extraArgTypes = !isLimit
    ? [{ name: "timestamp", type: "uint256" }, settlementFeeType]
    : [{ name: "timestamp", type: "uint256" }];
  const extraArgs = !isLimit
    ? { settlementFee, timestamp: ts }
    : { timestamp: ts };
  const partialSignatureParams = {
    types: {
      EIP712Domain,
      [key.partial]: [...tradeParamTypes, ...extraArgTypes],
    },
    primaryType: key.partial,
    domain,
    message: { ...baseMessage, ...extraArgs },
  };
  const fullSignatureParams = {
    types: {
      EIP712Domain,
      [key.full]: [...tradeParamTypes, ...extraArgTypes, isUpType],
    },
    primaryType: key.full,
    domain,
    message: { ...baseMessage, ...extraArgs, isAbove: isUp },
  };
  const res = await Promise.all([
    wallet.signTypedData(partialSignatureParams),
    wallet.signTypedData(fullSignatureParams),
  ]);
  return res;
};

const tradeParamTypes = [
  { name: "user", type: "address" },
  { name: "totalFee", type: "uint256" },
  { name: "period", type: "uint256" },
  { name: "targetContract", type: "address" },
  { name: "strike", type: "uint256" },
  { name: "slippage", type: "uint256" },
  { name: "allowPartialFill", type: "bool" },
  { name: "referralCode", type: "string" },
  // { name: 'traderNFTId', type: 'uint256' },
];

const isUpType = { name: "isAbove", type: "bool" };
const settlementFeeType = { name: "settlementFee", type: "uint256" };

async function generateApprovalSignatureWrapper(
  nonce: number,
  amount: string,
  userMainAccount: string,
  tokenAddress: string,
  routerAddress: string,
  deadline: string,
  activeChainId: any,
  signMethod: any,
  domainName: string
) {
  const res = await generateApprovalSignature(
    nonce,
    amount,
    userMainAccount,
    tokenAddress,
    routerAddress,
    deadline,
    activeChainId,
    signMethod,
    domainName
  );
  return { res, nonce };
}
const approveParamType = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];
const getRSVFromSignature = (signature: string) => {
  const r = signature.slice(0, 66);
  const s = "0x" + signature.slice(66, 130);
  const v = "0x" + signature.slice(130, 132);
  return { r, s, v };
};
const generateApprovalSignature = async (
  nonce: number,
  amount: string,
  userMainAccount: string,
  tokenAddress: string,
  routerAddress: string,
  deadline: string,
  activeChainId: any,
  signMethod: any,
  domainName: string
): Promise<[string, { r: string; s: string; v: string }]> => {
  const approveMessage = {
    nonce: +nonce,
    value: amount,
    owner: getAddress(userMainAccount),
    deadline,
    spender: getAddress(routerAddress),
  };
  const approveSignatureParams = {
    types: {
      EIP712Domain,
      Permit: approveParamType,
    },
    primaryType: "Permit",
    domain: {
      name: domainName,
      version: domainName === "USD Coin" ? "2" : "1",
      chainId: activeChainId,
      verifyingContract: getAddress(tokenAddress),
    },
    message: approveMessage,
  } as const;
  const res = await signMethod(approveSignatureParams);

  return [res, getRSVFromSignature(res)];
};
export {
  generateABSignatures,
  generateUDSignature,
  generateApprovalSignatureWrapper,
};
