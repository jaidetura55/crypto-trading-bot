require("dotenv").config()
const ccxt = require("ccxt")
const axios = require("axios")
const tulind = require("tulind")


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

  // console.log(bb, rsi[0], currentPrice)


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
  const { asset, base, minAsset, minBase } = config
  const market = `${asset}/${base}`

  // Cancel existing orders
  const orders = await binanceClient.fetchOpenOrders(market)
  orders.forEach(async order => {
    await binanceClient.cancelOrder(order.id, order.symbol)
  })

  // Get prices from CoinGecko for non-exchange specific price
  // To use a different asset/base pair, change the "ids" parameter in api url
  const results = await Promise.all([
    axios.get("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd"),
    axios.get("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd")
  ])
  const marketPrice = results[0].data.binancecoin.usd / results[1].data.tether.usd

  // Get balances of asset and base
  const balances = await binanceClient.fetchBalance()
  const assetBalance = balances.free[asset]
  const baseBalance = balances.free[base]

  // Time in milliseconds thirty "5min" candles ago (getting 31 because most recent ongoing candle not included)
  const since = binanceClient.milliseconds() - (31 * 300 * 1000)

  // Get OHLCV data, remove most recent ongoing candle, left with 30
  const data = await binanceClient.fetchOHLCV(`${asset}/${base}`, "5m", since)
  data.pop()
  
  // Decide whether to buy, sell, or hold
  const { action, amount } = await tradeConditions(data, marketPrice)



  // Check minimum allowed balances
  if(assetBalance * marketPrice <= minAsset) {
    console.log(`
      Insufficient ${asset} balance ...  ${assetBalance}
    `)
  }

  else if(baseBalance <= minBase) {
    console.log(`
      Insufficient ${base} balance ...  ${baseBalance}
    `)
  }

  else if(action === "buy") {
    let buyVolume = amount * assetBalance
    // await binanceClient.createMarketBuyOrder(market, buyVolume)
    console.log(`
      Bought ${value / marketPrice}${asset} @ $${marketPrice}
      Price: $${marketPrice}
      ${asset} balance: ${assetBalance} ====> (${assetBalance * marketPrice})
      ${base} balance: ${baseBalance}
      Total Balance Value: $${(assetBalance * marketPrice) + baseBalance}
    `)
  }

  else if(action === "sell") {
    let sellVolume = amount * baseBalance
    // await binanceClient.createMarketSellOrder(market, sellVolume)
    console.log(`
      Sold ${value / marketPrice}${asset} @ $${marketPrice}
      Price: $${marketPrice}
      ${asset} balance: ${assetBalance} ====> ($${assetBalance * marketPrice})
      ${base} balance: ${baseBalance}
      Total Balance Value: $${(assetBalance * marketPrice) + baseBalance}
    `)
  }

  else console.log(`
    No action taken.
    Price: $${marketPrice}
    ${asset} balance: ${assetBalance} ====> ($${assetBalance * marketPrice})
    ${base} balance: ${baseBalance}
    Total Balance Value: $${(assetBalance * marketPrice) + baseBalance}
  `)
}



const run = () => {
  const config = {
    asset: "BNB",
    base: "USDT",
    minAsset: 90,
    minBase: 90,
    tickInterval: 300000
  }

  const binanceClient = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SEC
  })

  tick(config, binanceClient)
  setInterval(tick, config.tickInterval, config, binanceClient)
}

run()
