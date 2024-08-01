import axios from "axios";
import { getAddress, keccak256, PrivateKeyAccount, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  generateABSignatures,
  generateApprovalSignatureWrapper,
  generateUDSignature,
} from "./generateSignatures";
import { getStrikePriceArray, getTimestamps } from "./ABExpiryTimestamp";
import { Asset2Pythid } from "./utils/PythIds";

const account = privateKeyToAccount(process.env.PK as `0x${string}`);
console.log(`account: `, account.address);
export const activeChain = {
  id: 42161n,
};

// FIXED
export const contractsConfig = {
  signerManager: "0x84cb6d8Fafa09D8A606f423feD6BB2745e677526" as const,
  abrouter: "0x94582981c3be6092b912265C2d2cE172e7f9c3B1" as const,
  udrouter: "0x2BAA48961C1CD376484b601278bF7A51E94293a9" as const,
};

// TOKENS
const TOKENS = [
  {
    contract: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    decimals: 18,
    name: "ARB",
    permitName: "Arbitrum",
  },
  {
    contract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    name: "USDC",
    permitName: "USD Coin",
  },
];
export const TokenConfigs = TOKENS[0];

// Fixed - Product config.
export const ProductsConfig = {
  ud: "abc",
  ab: "xyz",
  baseURL: "https://api-v2.6.buffer.finance/",
};

/*

For Aove-below fetch the Options Contracts from this query
https://ponder.buffer.finance
""""
query MyQuery {
  optionContracts(where:{routerContract:"0x94582981c3be6092b912265C2d2cE172e7f9c3B1"},limit:1000){
    items{
      address
      routerContract
      poolTokenId
      asset
      configContract{
        stepSize
      }
    }
}
"""




For Up-Down fetch the Options Contracts from
https://ponder.buffer.finance
""""
query MyQuery {
optionContracts(where:{routerContract:"0x94582981c3be6092b912265C2d2cE172e7f9c3B1"},limit:1000){
  items{
    address
    poolTokenId
    routerContract
    asset
    configContract{
      stepSize
    }
  }
}
"""


**Make sure you've choosen the contract respective to the Token.

*/
// E.g Option contracts for BTCUSD
const UD_BTC = {
  address: "0x5647FE1e071D583D5d0772a48737f02Fb2039745" as const, //ud
  asset: "BTCUSD",
  stepSize: null,
};
const AB_BTC = {
  address: "0x5f4726650D97D77c55c72Cb90c0be25ec1c460E6" as const,
  asset: "BTCUSD",
  stepSize: 500,
};
export const OptionContractConfig = AB_BTC;

// Pyth's public open for all base url. Consider using custom RPC like https://triton.one/ for heavy usage.
const PythBaseURL = "https://hermes.pyth.network";

const getOneCTNonce = async (account: string): Promise<number> => {
  const response = await axios.get(
    `https://api-v2.6.buffer.finance/user/onc_ct/?environment=${activeChain.id.toString()}&user=${account}`
  );
  return response.data.nonce;
};

const generatePk = async (nonce: number) => {
  const domain = {
    name: "Buffer Finance",
    version: "1",
    chainId: activeChain.id as any,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  } as const;
  const types = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    Registration: [
      { name: "content", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "chainId", type: "uint256" },
    ],
  } as const;

  const signature = await account.signTypedData({
    types,
    domain,
    primaryType: "Registration",
    message: {
      content: "I want to create a trading account with Buffer Finance",
      nonce: BigInt(nonce),
      chainId: activeChain.id as any,
    },
  });
  return keccak256(toBytes(signature));
};

const registerOneCt = async (wallet: PrivateKeyAccount, nonce: number) => {
  const url = `https://api-v2.6.buffer.finance/user/onc_ct/?environment=${activeChain.id.toString()}&user=${
    account.address
  }`;
  console.log(`url: `, url);
  const response = await axios.get(url);
  if (wallet.address == response.data.one_ct && nonce == response.data.nonce) {
    console.log("you are already registered!");
    return;
  }
  const domain = {
    name: "Validator",
    version: "1",
    chainId: activeChain.id as any,
    verifyingContract: getAddress(contractsConfig.signerManager),
  } as const;

  const types = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    RegisterAccount: [
      { name: "oneCT", type: "address" },
      { name: "user", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  } as const;

  const signature = await account.signTypedData({
    types,
    domain,
    primaryType: "RegisterAccount",
    message: {
      oneCT: wallet.address,
      user: account.address,
      nonce: BigInt(nonce),
    },
  });

  const apiParams = {
    one_ct: wallet.address,
    account: account.address,
    nonce: nonce,
    registration_signature: signature,
    environment: activeChain.id,
  };

  const resp = await axios.post(
    "https://api-v2.6.buffer.finance/register/",
    null,
    {
      params: apiParams,
    }
  );
};
const absoluteInt = (a: bigint, factor = 6) => {
  const decimals = 3;
  const number = Number(BigInt(a) * BigInt(10 ** decimals)) / 10 ** decimals;
  return Math.floor(number);
};
// 10 mins
const getRSVFromSignature = (signature: string) => {
  const r = signature.slice(0, 66);
  const s = "0x" + signature.slice(66, 130);
  const v = "0x" + signature.slice(130, 132);
  return { r, s, v };
};

const approveToUD = async (
  onectWallet: PrivateKeyAccount,
  maxAmount: string
) => {
  const { data, status } = await axios.get(
    `https://api-v2.6.buffer.finance/user/approval/?environment=${activeChain.id.toString()}&user=${
      account.address
    }&token=${TokenConfigs.name}&product_id=${ProductsConfig.ud}`
  );
  if (BigInt(data.allowance) >= BigInt(maxAmount)) {
    console.log("you have enogh allowance already");
    return;
  }
  const nonce = data.nonce;
  // const maxAmount =
  //   "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  const deadline = (Math.round(Date.now() / 1000) + 86400).toString();
  const approveMessage = {
    nonce: +nonce,
    value: maxAmount,
    owner: getAddress(account.address),
    deadline,
    spender: getAddress(contractsConfig.udrouter),
  };
  const domainName = TokenConfigs.permitName as string;
  const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ];
  const approveParamType = [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ];
  const approveSignatureParams = {
    types: {
      EIP712Domain,
      Permit: approveParamType,
    },

    primaryType: "Permit",
    domain: {
      name: domainName,
      version: domainName === "USD Coin" ? "2" : "1",
      chainId: activeChain.id,
      verifyingContract: getAddress(TokenConfigs.contract),
    },
    message: approveMessage,
  } as const;
  const res = await account.signTypedData(approveSignatureParams);
  const RSV = getRSVFromSignature(res);
  console.log(`RSV: `, RSV);
  const signMessage =
    "Sign to verify your user address with Buffer Finance v2.5 on Arbitrum One and Arbitrum Goerli";
  const user_signature = await onectWallet.signMessage({
    message: signMessage,
  });
  const apiSignature = {
    user: account.address,
    nonce: +nonce,
    allowance: maxAmount,
    deadline: +deadline,
    v: parseInt(RSV.v, 16),
    r: RSV.r,
    s: RSV.s,
    user_signature,
    environment: activeChain.id,
    state: "PENDING",
    product_id: ProductsConfig.ud,
    token: TokenConfigs.name,
  };
  const resp = await axios.post(ProductsConfig.baseURL + "approve/", null, {
    params: apiSignature,
  });
};
const approveToAB = async (
  onectWallet: PrivateKeyAccount,
  maxAmount: string
) => {
  const { data, status } = await axios.get(
    `https://api-v2.6.buffer.finance/user/approval/?environment=${activeChain.id.toString()}&user=${
      account.address
    }&token=${TokenConfigs.name}&product_id=${ProductsConfig.ab}`
  );
  if (BigInt(data.allowance) >= BigInt(maxAmount)) {
    console.log("you have enogh allowance already");
    return;
  }

  console.log(`data: `, data);
  const nonce = data.nonce;

  const deadline = (Math.round(Date.now() / 1000) + 86400).toString();
  const { res } = await generateApprovalSignatureWrapper(
    +nonce,
    maxAmount,
    account.address,
    TokenConfigs.contract,
    contractsConfig.abrouter,
    deadline,
    Number(activeChain.id),
    account.signTypedData,
    TokenConfigs.permitName
  );
  const [_, RSV] = res;
  const signMessage =
    "Sign to verify your user address with Buffer Finance v2.5 on Arbitrum One and Arbitrum Goerli";
  const user_signature = await onectWallet.signMessage({
    message: signMessage,
  });
  const apiSignature = {
    user: account.address,
    nonce: +nonce,
    allowance: maxAmount,
    deadline: +deadline,
    v: parseInt(RSV.v, 16),
    r: RSV.r,
    s: RSV.s,
    user_signature,
    environment: activeChain.id,
    state: "PENDING",
    product_id: ProductsConfig.ab,
    token: TokenConfigs.name,
  };
  const resp = await axios.post(ProductsConfig.baseURL + "approve/", null, {
    params: apiSignature,
  });
};

// 30 mins
interface updownoptions {
  type: "up" | "down";
  size: string;
  optionConfig: {
    address: `0x${string}`;
    asset: string;
  };
}
export const getPrice = async () => {
  const url = `${PythBaseURL}/api/latest_price_feeds?ids[]=${
    Asset2Pythid[OptionContractConfig.asset].pythId
  }&verbose=true&binary=true`;
  console.log(`url: `, url);
  const results = await axios.get(url);
  const price = BigInt(results.data[0].price.price);
  const btcPrice = absoluteInt(price, -results.data[0].price.expo);
  console.log(`btcPrice: `, btcPrice);
  return btcPrice / 10 ** 8;
};
// Up/Down & size & optioncontract
const buyBufferFinanceUpDownOption = async (
  oneCtWallet: PrivateKeyAccount,
  { type, size, optionConfig }: updownoptions
) => {
  const response = await axios.get(
    ProductsConfig.baseURL +
      `settlement_fee/?environment=${activeChain.id}&product_id=${ProductsConfig.ud}`
  );
  const { data: allSpreads, status } = await axios.get(
    ProductsConfig.baseURL + "spread/",
    {
      params: {
        environment: activeChain.id.toString(),
        product_id: ProductsConfig.ud,
      },
    }
  );

  let settelmentFee = response.data[optionConfig.asset];
  const spread = allSpreads?.[optionConfig.asset];
  console.log(`spread: `, spread, settelmentFee);
  if (spread === undefined || spread === null) {
    throw new Error("Spread not found");
  }
  if (settelmentFee === undefined || settelmentFee === null) {
    throw new Error("settlement fee not found");
  }
  let currentTimestamp = Date.now();
  let currentUTCTimestamp = Math.floor(currentTimestamp / 1000);
  const expirationInMins = 1;
  const address = account.address;
  const BTCUSD =
    "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
  const results = await axios.get(
    `${PythBaseURL}/api/latest_price_feeds?ids[]=${
      Asset2Pythid[OptionContractConfig.asset].pythId
    }&verbose=true&binary=true`
  );
  const price = BigInt(results.data[0].price.price);
  console.log(`price: `, price);
  const btcPrice = absoluteInt(price, -results.data[0].price.expo);

  enum ArgIndex {
    Strike = 4,
    Period = 2,
    TargetContract = 3,
    UserAddress = 0,
    Size = 1,
    PartialFill = 6,
    Referral = 7,
    NFT = 8,
    Slippage = 5,
  }
  let baseArgs = [
    address,
    size,
    expirationInMins * 60 + "",
    optionConfig.address,
    btcPrice.toString(),
    "5", //slippage 0.05%
    true, //partialfill
    "123", //referral
    "0",
  ] as const;
  const signatures = await generateUDSignature(
    address,
    size.toString(),
    expirationInMins,
    OptionContractConfig.address,
    btcPrice.toString(),
    baseArgs[ArgIndex.Slippage], //slippage
    baseArgs[ArgIndex.PartialFill], //partialfill
    baseArgs[ArgIndex.Referral],
    currentUTCTimestamp,
    settelmentFee?.settlement_fee!,
    type == "up",
    oneCtWallet,
    Number(activeChain.id),
    contractsConfig.udrouter
    // spread.spread
  );
  let apiParams = {
    signature_timestamp: currentUTCTimestamp,
    strike: baseArgs[ArgIndex.Strike],
    period: baseArgs[ArgIndex.Period],
    target_contract: baseArgs[ArgIndex.TargetContract],
    partial_signature: signatures[0],
    full_signature: signatures[1],
    user_address: baseArgs[ArgIndex.UserAddress],
    trade_size: baseArgs[ArgIndex.Size],
    allow_partial_fill: baseArgs[ArgIndex.PartialFill],
    referral_code: baseArgs[ArgIndex.Referral],
    trader_nft_id: baseArgs[ArgIndex.NFT],
    slippage: baseArgs[ArgIndex.Slippage],
    is_above: type == "up",
    is_limit_order: false,
    limit_order_duration: 0,
    settlement_fee: settelmentFee?.settlement_fee!,
    settlement_fee_sign_expiration:
      settelmentFee?.settlement_fee_sign_expiration,
    settlement_fee_signature: settelmentFee?.settlement_fee_signature,
    product_id: ProductsConfig.ud,
    token: TokenConfigs.name,
    strike_timestamp: currentUTCTimestamp,
  };
  const resp = await axios.post(
    "https://api-v2.6.buffer.finance/create/?environment=42161",
    apiParams
  );
};
const buyBufferFinanceAboveBelowOption = async (
  oneCtWallet: PrivateKeyAccount,
  { type, size, optionConfig }: updownoptions
) => {
  const response = await axios.get(
    ProductsConfig.baseURL +
      `settlement_fee/?environment=${activeChain.id}&product_id=${ProductsConfig.ab}`
  );
  console.log(`response: `, response);
  const { data: allSpreads, status } = await axios.get(
    ProductsConfig.baseURL + "spread/",
    {
      params: {
        environment: activeChain.id.toString(),
        product_id: ProductsConfig.ab,
      },
    }
  );
  console.log(`allSpreads: `, allSpreads);

  const spread = allSpreads?.[optionConfig.asset];
  if (spread === undefined || spread === null) {
    throw new Error("Spread not found");
  }

  let currentTimestamp = Date.now();
  const address = account.address;
  const assetPrice = await getPrice();
  const expiryTs = getTimestamps();

  let [increaseingStrikeArray, decreasingStrikeArray] =
    await getStrikePriceArray(expiryTs[0], assetPrice);
  const selectedStrike =
    increaseingStrikeArray[increaseingStrikeArray.length - 1];
  const slippage = 5;
  const totalFee =
    type == "up" ? selectedStrike.totalFeeAbove : selectedStrike.totalFeeBelow;
  if (totalFee == null) throw new Error("totalFee is null");
  const maxFeePerContracts = totalFee + slippage * totalFee;

  let baseArgs = {
    user: account.address,
    expiration: Math.floor(+expiryTs[0] / 1000),
    size,
    maxFeePerContracts: Math.floor(
      maxFeePerContracts * 10 ** TokenConfigs.decimals
    ).toString(),
    targetAddress: OptionContractConfig.address,
    strike: Math.floor(selectedStrike.strike * 10 ** 8).toString(),
    partialFill: true,
    referral: "",
    currentTimestamp: Math.floor(Date.now() / 1000).toString(),
    isAbove: type == "up",
    activeChainId: Number(activeChain.id),
    routerContract: contractsConfig.abrouter,
    oneCTwallet: oneCtWallet,
  };
  const argsArray = [
    baseArgs.user,
    baseArgs.expiration,
    baseArgs.size,
    baseArgs.maxFeePerContracts,
    baseArgs.targetAddress,
    baseArgs.strike,
    baseArgs.partialFill,
    baseArgs.referral,
    baseArgs.currentTimestamp,
    baseArgs.isAbove,
    baseArgs.activeChainId,
    baseArgs.routerContract,
  ] as const;

  const sign = await generateABSignatures(...argsArray, baseArgs.oneCTwallet);
  let apiParams = {
    signature_timestamp: baseArgs.currentTimestamp,
    signature: sign,
    expiration: baseArgs.expiration,
    target_contract: baseArgs.targetAddress,
    user_address: address,
    total_fee: baseArgs.size,
    strike: baseArgs.strike,
    max_fee_per_contract: baseArgs.maxFeePerContracts,
    allow_partial_fill: baseArgs.partialFill,
    referral_code: "",
    is_above: baseArgs.isAbove,
    environment: baseArgs.activeChainId.toString(),
    token: TokenConfigs.name,
    product_id: ProductsConfig.ab,
    asset_pair: OptionContractConfig.asset,
  };
  console.log(`apiParams: `, apiParams);
  const resp = await axios.post(
    "https://api-v2.6.buffer.finance/create/?environment=42161",
    apiParams
  );
  console.log(`resp: `, resp.data);
};

async function ab() {
  const nonce = await getOneCTNonce(account.address);
  const pk = await generatePk(nonce);
  const approvalAmount = "1000000000000000000000000";
  const onectWallet = privateKeyToAccount(pk);
  await registerOneCt(onectWallet, nonce);
  await approveToAB(onectWallet, approvalAmount);
  const queueid = await buyBufferFinanceAboveBelowOption(onectWallet, {
    type: "up",
    optionConfig: OptionContractConfig,
    size: BigInt(10 ** TokenConfigs.decimals).toString(),
  });
}
async function ud() {
  const nonce = await getOneCTNonce(account.address);
  const pk = await generatePk(nonce);
  const approvalAmount = "1000000000000000000000000";
  const onectWallet = privateKeyToAccount(pk);
  await registerOneCt(onectWallet, nonce);
  await approveToUD(onectWallet, approvalAmount);
  const queueid = await buyBufferFinanceUpDownOption(onectWallet, {
    type: "down",
    optionConfig: OptionContractConfig,
    size: BigInt(10 ** TokenConfigs.decimals).toString(),
  });
}
/*driver functions*/
ab();
// ud();
