require("dotenv").config()
const ccxt = require("ccxt")
const axios = require("axios")
const tulind = require("tulind")


let fakeAssetBal, fakeBaseBal


const tradeConditions = async (data, currentPrice) => {
  const open = data.map(d => d[1])
  const high = data.map(d => d[2])
  const low = data.map(d => d[3])
  const close = data.map(d => d[4])

  let typicalPrices = []

  for(let x = 0; x < high.length; x++) {
    let typicalPrice = (high[x] + low[x] + close[x]) / 3
    typicalPrices.push(typicalPrice)
  }

  let order = { action: "none", amount: 0 }
  let rsi = []
  let bb = []


  // Get RSI for last 13 periods
  tulind.indicators.rsi.indicator([ close ], [ 13 ], (err, res) => {
    if(err) rsi = "ERROR"
    rsi = res[0]
  })

  // Get Bollinger Bands for last 30 periods
  tulind.indicators.bbands.indicator([ typicalPrices ], [ 30, 2 ], (err, res) => {
    if(err) bb = "ERROR"
    bb = res
  })

  // Reverse arrays from (earliest => latest) to (latest => earliest)
  rsi.reverse()
  bb.reverse()

  // Check for errors in calculation
  if(rsi.includes("ERROR") || bb.includes("ERROR")) {
    console.log("Error in Bollinger Band or RSI.")
  }

  console.log(bb, rsi[0], currentPrice)


  // Check Bollinger Band params
  if(currentPrice <= bb[0][0] && currentPrice >= bb[2][0]) {
    order = order
  }
  else if(currentPrice > bb[0][0]) {
    order = {action: "sell", amount: 0.05}
  }
  else if(currentPrice < bb[2][0]) {
    order = {action: "buy", amount: 0.05}
  }

  // Check RSI params
  if(rsi[0] <= 75 && rsi[0] >= 25) {
    order = order
  }
  else if(rsi[0] > 75) {
    order = {action: "sell", amount: 0.1}
  }
  else if(rsi[0] < 25) {
    order = {action: "buy", amount: 0.1}
  }

  return order
}



const tick = async (config, binanceClient) => {
  const { asset, base, spread, allocation } = config
  const market = `${asset}/${base}`

  const orders = await binanceClient.fetchOpenOrders(market)
  
  orders.forEach(async order => {
    await binanceClient.cancelOrder(order.id, order.symbol)
  })

  const results = await Promise.all([
    axios.get("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd"),
    axios.get("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd")
  ])

  const [ bnb, tether ] = results
  const marketPrice = bnb.data.binancecoin.usd / tether.data.tether.usd

  const sellPrice = marketPrice * (1 + spread)
  const buyPrice = marketPrice * (1 - spread)

  const balances = await binanceClient.fetchBalance()
  const assetBalance = balances.free[asset]
  const baseBalance = balances.free[base]

  const sellVolume = assetBalance * allocation
  const buyVolume = (baseBalance * allocation) / marketPrice

  // Time in milliseconds thirty "5min" candles ago (getting 31 because most recent ongoing candle not included)
  const since = binanceClient.milliseconds() - (31 * 300 * 1000)

  // Get OHLCV data, remove most recent ongoing candle, left with 30
  const data = await binanceClient.fetchOHLCV(`${asset}/${base}`, "5m", since)
  data.pop()
  
  // Decide whether to buy, sell, or hold
  const { action, amount } = await tradeConditions(data, marketPrice)


















  if(action === "buy") {
    let value = amount * fakeBaseBal
    fakeAssetBal += value * marketPrice
    fakeBaseBal -= value
    console.log(`
      Bought ${value / marketPrice}${asset} @ ${marketPrice}
      ${asset} balance: ${fakeAssetBal} => ${fakeAssetBal * marketPrice}USDT
      ${base} balance: ${fakeBaseBal}
      Total Bal: ${(fakeAssetBal * marketPrice) + fakeBaseBal}
    `)
  }
  else if(action === "sell") {
    let value = amount * fakeAssetBal * marketPrice
    fakeAssetBal -= value / marketPrice
    fakeBaseBal += value
    console.log(`
      Sold ${value / marketPrice}${asset} @ $${marketPrice}
      ${asset} balance: ${fakeAssetBal} => ${fakeAssetBal * marketPrice}USDT
      ${base} balance: ${fakeBaseBal}
      Total Bal: ${(fakeAssetBal * marketPrice) + fakeBaseBal}
    `)
  }
  else console.log(`No action taken.`)















  // await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice)
  // await binanceClient.createLimitBuyOrder(market, buyVolume, buyPrice)
}

const run = () => {
  const config = {
    asset: "BNB",
    base: "USDT",
    allocation: 0.1,
    spread: 0.01,
    tickInterval: 300000
  }

  const binanceClient = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SEC
  })


  fakeAssetBal = 0.37
  fakeBaseBal = 130

  tick(config, binanceClient)
  setInterval(tick, config.tickInterval, config, binanceClient)
}

run()
