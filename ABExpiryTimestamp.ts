import axios from "axios";
import { activeChain, OptionContractConfig, ProductsConfig } from ".";
import { BlackScholes } from "./utils/blackscholes";

export function getTimestamps(date = Date.now()) {
  const timestamps = [];
  const currentTimestamp = new Date(date).getTime();
  // Start of Day (8 PM current day or next day)
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(8, 0, 0, 0);

  // Check if the current time has passed 8 PM
  if (startOfDay.getTime() <= date) {
    startOfDay.setUTCDate(startOfDay.getUTCDate() + 1); // Move to the next day
  }
  const startOfDayTimestamp = startOfDay.getTime();

  //dont show if the start of day is more than 12 hours away
  if (startOfDayTimestamp - currentTimestamp > 43200000) {
    timestamps.push(startOfDayTimestamp);
  }

  //add next day if the start of day is less than 36 hours away
  if (startOfDayTimestamp - currentTimestamp < 129600000) {
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    nextDay.setUTCHours(8, 0, 0, 0);
    const nextDayTimestamp = nextDay.getTime();
    if (nextDayTimestamp - currentTimestamp > 43200000) {
      timestamps.push(nextDayTimestamp);
    }
  }

  //add 2nd day
  const day2 = new Date(date);
  day2.setUTCDate(day2.getUTCDate() + 2);
  day2.setUTCHours(8, 0, 0, 0);
  const day2Timestamp = day2.getTime();
  timestamps.push(day2Timestamp);

  //add 3rd day
  const day3 = new Date(date);
  day3.setUTCDate(day3.getUTCDate() + 3);
  day3.setUTCHours(8, 0, 0, 0);
  const day3Timestamp = day3.getTime();
  timestamps.push(day3Timestamp);

  const getWeekend = (week: number) => {
    const endOfWeek = new Date(date);
    const daysUntilFriday = (5 - endOfWeek.getUTCDay() + 7) % 7; // Calculate days until Friday
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + daysUntilFriday + week * 7);
    endOfWeek.setUTCHours(8, 0, 0, 0);
    return endOfWeek.getTime();
  };

  // End of Week (Friday) at 8 PM
  const week1 = getWeekend(0);
  const week2 = getWeekend(1);
  const week3 = getWeekend(2);
  const week4 = getWeekend(3);
  if (week1 - currentTimestamp > 43200000) timestamps.push(week1);

  timestamps.push(week2);
  timestamps.push(week3);
  timestamps.push(week4);
  // return unique timestamps
  return [...new Set(timestamps)];
}
export function getRoundedPrice(price: number, step: number) {
  return Math.round(price / step) * step;
}

export const getStrikePriceArray = async (
  expiration: number,
  assetPrice: number
) => {
  const response = await axios.get(ProductsConfig.baseURL + `settlement_fee/`, {
    params: {
      environment: activeChain?.id.toString(),
      product_id: ProductsConfig.ab,
    },
  });
  const iv = await axios.get(ProductsConfig.baseURL + `iv/`, {
    params: {
      environment: activeChain?.id.toString(),
      product_id: ProductsConfig.ab,
    },
  });
  const assetIv = iv.data[OptionContractConfig.asset];
  const baseSettlementFee = response.data["sfs"]["Base"];
  let currentPrice = assetPrice;
  console.log(`currentPrice: `, currentPrice);
  const currentEpoch = Math.floor(Date.now() / 1000);
  const decreasingPriceArray = [];
  const increasingPriceArray = [];
  let i = 0;
  const stepsize = OptionContractConfig.stepSize;
  let j = 0;
  const roundedPrice = getRoundedPrice(+currentPrice, +stepsize);
  while (true) {
    const startPrice =
      roundedPrice > currentPrice ? roundedPrice - +stepsize : roundedPrice;
    const strikePrice = startPrice - i * +stepsize;

    const settlementFeeAbove = baseSettlementFee;
    const aboveProbability = BlackScholes(
      true,
      true,
      currentPrice,
      strikePrice,
      Math.floor(expiration / 1000) - currentEpoch,
      0,
      assetIv / 1e4
    );
    let totalFeeAbove =
      aboveProbability + (settlementFeeAbove / 1e4) * aboveProbability;

    if (totalFeeAbove > 0.95) totalFeeAbove = null;
    const belowProbability = BlackScholes(
      true,
      false,
      currentPrice,
      strikePrice,
      Math.floor(expiration / 1000) - currentEpoch,
      0,
      assetIv / 1e4
    );

    const settlementFeeBelow = baseSettlementFee;

    let totalFeeBelow =
      belowProbability + (settlementFeeBelow / 1e4) * belowProbability;
    if (totalFeeBelow < 0.05) totalFeeBelow = null;
    if (totalFeeAbove === null && totalFeeBelow === null) break;
    decreasingPriceArray.push({
      strike: strikePrice,
      totalFeeAbove,
      totalFeeBelow,
      baseFeeAbove: aboveProbability,
      baseFeeBelow: belowProbability,
    });

    i++;
  }

  while (true) {
    const startPrice =
      roundedPrice < currentPrice ? roundedPrice + +stepsize : roundedPrice;
    const strikePrice = startPrice + j * +stepsize;

    const settlementFeeAbove = baseSettlementFee;
    const aboveProbability = BlackScholes(
      true,
      true,
      currentPrice,
      strikePrice,
      Math.floor(expiration / 1000) - currentEpoch,
      0,
      assetIv / 1e4
    );
    let totalFeeAbove: number | null =
      aboveProbability + (settlementFeeAbove / 1e4) * aboveProbability;
    i++;

    if (totalFeeAbove < 0.05) totalFeeAbove = null;
    const belowProbability = BlackScholes(
      true,
      false,
      currentPrice,
      strikePrice,
      Math.floor(expiration / 1000) - currentEpoch,
      0,
      assetIv / 1e4
    );
    const settlementFeeBelow = baseSettlementFee;
    let totalFeeBelow: number | null =
      belowProbability + (settlementFeeBelow / 1e4) * belowProbability;
    if (totalFeeBelow > 0.95) totalFeeBelow = null;
    if (totalFeeAbove === null && totalFeeBelow === null) break;
    increasingPriceArray.push({
      strike: strikePrice,
      totalFeeAbove,
      totalFeeBelow,
      baseFeeAbove: aboveProbability,
      baseFeeBelow: belowProbability,
    });
    j++;
  }
  return [increasingPriceArray.reverse(), decreasingPriceArray];
};
