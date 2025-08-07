// ───────────────────────────────────────────────
// ~/main.js
// ───────────────────────────────────────────────
import BN from 'bn.js';
import { loadWalletKeypair } from './lib/solana.js';
import { openDlmmPosition, recenterPosition } from './lib/dlmm.js';
import 'dotenv/config';
import { getMintDecimals } from './lib/solana.js';
import { getPrice } from './lib/price.js';
import { promptSolAmount, promptTokenRatio, promptBinSpan, promptPoolAddress, promptLiquidityStrategy, promptSwaplessRebalance, promptAutoCompound, promptTakeProfitStopLoss } from './balance-prompt.js';
import dlmmPackage from '@meteora-ag/dlmm';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
// pull vars from the environment
const {
  RPC_URL,
  WALLET_PATH,
  MONITOR_INTERVAL_SECONDS = 5,
} = process.env;

async function monitorPositionLoop(
  connection,
  dlmmPool,
  userKeypair,
  initialCapitalUsd,
  positionPubKey,
  intervalSeconds,
  originalParams = {}
) {
  const startTime = Date.now(); // Track start time for runtime calculation
  console.log(`Starting monitoring - Interval ${intervalSeconds}s`);
  console.log(`Tracking Position: ${positionPubKey.toBase58()}`);
  console.log(`Rebalancing logic: Only triggers when price moves outside position range`);
  
  // P&L Tracking Variables
  let totalFeesEarnedUsd = 0;
  let rebalanceCount = 0;
  console.log(`📈 P&L Tracking initialized - Initial deposit: $${initialCapitalUsd.toFixed(2)}`);

  /* ─── 1. token-decimals  ─────────────────────────────── */
  if (typeof dlmmPool.tokenX.decimal !== 'number')
    dlmmPool.tokenX.decimal = await getMintDecimals(connection, dlmmPool.tokenX.publicKey);
  if (typeof dlmmPool.tokenY.decimal !== 'number')
    dlmmPool.tokenY.decimal = await getMintDecimals(connection, dlmmPool.tokenY.publicKey);
  const dx = dlmmPool.tokenX.decimal;
  const dy = dlmmPool.tokenY.decimal;
  console.log(`Token decimals: X=${dx}, Y=${dy}`);

  /* ─── 3. heading ────────────────────────────────────────────────── */
  console.log(
    "Time         | Total($)  | P&L($)   | P&L(%)   | Fees($)  | Rebalances | TP/SL Status"
  );

  /* ─── 4. loop ───────────────────────────────────────────────────── */
  while (true) {
    try {
      /* 4-A refresh on-chain state --------------------------------- */
      await dlmmPool.refetchStates();
      const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(userKeypair.publicKey);
      const activeBin   = await dlmmPool.getActiveBin();
      const pos         = userPositions.find(p => p.publicKey.equals(positionPubKey));
      if (!activeBin) {
        console.log('❌ Could not get active bin - retrying in next cycle');
        await new Promise(r => setTimeout(r, intervalSeconds * 1_000));
        continue;
      }
      if (!pos) {
        console.log('❌ Position not found - may have been closed or failed to create');
        console.log(`   Searching for position: ${positionPubKey.toBase58()}`);
        console.log(`   Found ${userPositions.length} positions:`, userPositions.map(p => p.publicKey.toBase58()));
        break;
      }

      /* 4-B amounts ------------------------------------------------- */
      let lamX = new BN(0), lamY = new BN(0);
      pos.positionData.positionBinData.forEach(b => {
        lamX = lamX.add(new BN(b.positionXAmount));
        lamY = lamY.add(new BN(b.positionYAmount));
      });
      const feeX = new BN(pos.positionData.feeX);
      const feeY = new BN(pos.positionData.feeY);

      const amtX     = lamX.toNumber() / 10 ** dx;
      const amtY     = lamY.toNumber() / 10 ** dy;
      const feeAmtX  = feeX.toNumber() / 10 ** dx;
      const feeAmtY  = feeY.toNumber() / 10 ** dy;

      const pxX      = await getPrice(dlmmPool.tokenX.publicKey.toString());
      const pxY      = await getPrice(dlmmPool.tokenY.publicKey.toString());

      const liqUsd   = amtX * pxX + amtY * pxY;
      const feesUsd  = feeAmtX * pxX + feeAmtY * pxY;
      const totalUsd = liqUsd + feesUsd;

      /* 4-C rebalance if ACTUALLY AT position edges ------------------- */
      const lowerBin = pos.positionData.lowerBinId;
      const upperBin = pos.positionData.upperBinId;
      const activeBinId = activeBin.binId;

      // Check if price moved COMPLETELY OUTSIDE position range 
      const outsideLowerRange = activeBinId < lowerBin;
      const outsideUpperRange = activeBinId > upperBin;
      
      console.log(`📊 Position Status: Active bin ${activeBinId}, Range: ${lowerBin} to ${upperBin}`);
      
      if (outsideLowerRange) {
        console.log(`   ⬇️  Price moved BELOW position range (${activeBinId} < ${lowerBin})`);
      } else if (outsideUpperRange) {
        console.log(`   ⬆️  Price moved ABOVE position range (${activeBinId} > ${upperBin})`);
      } else {
        const binsFromLower = activeBinId - lowerBin;
        const binsFromUpper = upperBin - activeBinId;
        console.log(`   ✅ Price within range (${binsFromLower} bins from lower, ${binsFromUpper} bins from upper)`);
      }

      if (outsideLowerRange || outsideUpperRange) {
        const direction = outsideLowerRange ? 'BELOW' : 'ABOVE';
        
        console.log(`🔄 REBALANCING TRIGGERED: Price moved ${direction} position range!`);
        console.log(`   Active bin: ${activeBinId}, Position range: ${lowerBin} to ${upperBin}`);

        // Determine rebalance direction for swapless mode
        const rebalanceDirection = outsideLowerRange ? 'DOWN' : 'UP';
        const res = await recenterPosition(connection, dlmmPool, userKeypair, positionPubKey, originalParams, rebalanceDirection);
        if (!res) break;

        dlmmPool        = res.dlmmPool;
        positionPubKey  = res.positionPubKey;
        
        // Update P&L tracking
        totalFeesEarnedUsd += res.feesEarnedUsd || 0;
        rebalanceCount += 1;
        
        console.log(`✅ Rebalancing complete - resuming monitoring every ${intervalSeconds}s`);
        console.log(`📈 P&L Update: Total fees earned: $${totalFeesEarnedUsd.toFixed(4)}, Rebalances: ${rebalanceCount}`);
        
        // 🔧 FIX: Refetch position data after rebalancing to get correct P&L
        await dlmmPool.refetchStates();
        const { userPositions: updatedPositions } = await dlmmPool.getPositionsByUserAndLbPair(userKeypair.publicKey);
        const updatedPos = updatedPositions.find(p => p.publicKey.equals(positionPubKey));
        
        if (updatedPos) {
          // Recalculate amounts and USD value with NEW position data
          let newLamX = new BN(0), newLamY = new BN(0);
          updatedPos.positionData.positionBinData.forEach(b => {
            newLamX = newLamX.add(new BN(b.positionXAmount));
            newLamY = newLamY.add(new BN(b.positionYAmount));
          });
          const newFeeX = new BN(updatedPos.positionData.feeX);
          const newFeeY = new BN(updatedPos.positionData.feeY);

          const newAmtX = newLamX.toNumber() / 10 ** dx;
          const newAmtY = newLamY.toNumber() / 10 ** dy;
          const newFeeAmtX = newFeeX.toNumber() / 10 ** dx;
          const newFeeAmtY = newFeeY.toNumber() / 10 ** dy;

          const newLiqUsd = newAmtX * pxX + newAmtY * pxY;
          const newFeesUsd = newFeeAmtX * pxX + newFeeAmtY * pxY;
          const totalUsd = newLiqUsd + newFeesUsd;
          
          // Calculate P&L metrics with UPDATED position value
          const currentPnL = totalUsd - initialCapitalUsd;
          const pnlPercentage = ((currentPnL / initialCapitalUsd) * 100);
          
          // Show TP/SL status in rebalance display too
          const tpStatus = originalParams.takeProfitEnabled ? `TP:+${originalParams.takeProfitPercentage}%` : 'TP:OFF';
          const slStatus = originalParams.stopLossEnabled ? `SL:-${originalParams.stopLossPercentage}%` : 'SL:OFF';
          
          console.log(
            `${new Date().toLocaleTimeString()} | ` +
            `${totalUsd.toFixed(2).padStart(8)} | ` +
            `${currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2).padStart(7)} | ` +
            `${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(1).padStart(6)}% | ` +
            `${totalFeesEarnedUsd.toFixed(2).padStart(7)} | ` +
            `${rebalanceCount.toString().padStart(9)} | ` +
            `${tpStatus} | ${slStatus}`
          );
        }
        
        // Skip normal P&L calculation since we already did it above
        await new Promise(r => setTimeout(r, intervalSeconds * 1_000));
        continue;
      }

      // Calculate P&L metrics (for normal monitoring cycles)
      const currentPnL = totalUsd - initialCapitalUsd;
      const pnlPercentage = ((currentPnL / initialCapitalUsd) * 100);
      
      // Show TP/SL status in display
      const tpStatus = originalParams.takeProfitEnabled ? `TP:+${originalParams.takeProfitPercentage}%` : 'TP:OFF';
      const slStatus = originalParams.stopLossEnabled ? `SL:-${originalParams.stopLossPercentage}%` : 'SL:OFF';
      
      console.log(
        `${new Date().toLocaleTimeString()} | ` +
        `${totalUsd.toFixed(2).padStart(8)} | ` +
        `${currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2).padStart(7)} | ` +
        `${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(1).padStart(6)}% | ` +
        `${totalFeesEarnedUsd.toFixed(2).padStart(7)} | ` +
        `${rebalanceCount.toString().padStart(9)} | ` +
        `${tpStatus} | ${slStatus}`
      );

      // 🎯 TAKE PROFIT & STOP LOSS CHECK
      if ((originalParams.takeProfitEnabled || originalParams.stopLossEnabled) && !isNaN(pnlPercentage)) {
        let shouldClose = false;
        let closeReason = '';
        
        // Check Take Profit
        if (originalParams.takeProfitEnabled && pnlPercentage >= originalParams.takeProfitPercentage) {
          shouldClose = true;
          closeReason = `🎯 TAKE PROFIT triggered at +${pnlPercentage.toFixed(1)}% (target: +${originalParams.takeProfitPercentage}%)`;
        }
        
        // Check Stop Loss  
        if (originalParams.stopLossEnabled && pnlPercentage <= -originalParams.stopLossPercentage) {
          shouldClose = true;
          closeReason = `🛑 STOP LOSS triggered at ${pnlPercentage.toFixed(1)}% (limit: -${originalParams.stopLossPercentage}%)`;
        }
        
        if (shouldClose) {
          console.log('\n' + '='.repeat(80));
          console.log(closeReason);
          console.log(`💰 Final P&L: $${currentPnL.toFixed(2)} (${pnlPercentage.toFixed(1)}%)`);
          console.log(`📊 Position Value: $${totalUsd.toFixed(2)}`);
          console.log(`📈 Total Fees Earned: $${totalFeesEarnedUsd.toFixed(2)}`);
          console.log(`🔄 Total Rebalances: ${rebalanceCount}`);
          console.log(`⏰ Total Runtime: ${Math.floor((Date.now() - startTime) / 60000)} minutes`);
          console.log('='.repeat(80));
          
          // Close position and swap to SOL
          try {
            console.log('🔄 Closing position and swapping all tokens to SOL...');
            
            // Import and call the close function
            const { closeAllPositions } = await import('./close-position.js');
            await closeAllPositions();
            
            console.log('✅ Position closed successfully due to TP/SL trigger');
            console.log('🚀 Bot execution completed - all tokens swapped to SOL');
            
            // Exit the monitoring loop
            return; 
            
          } catch (error) {
            console.error('❌ Error closing position:', error.message);
            console.log('⚠️  Continuing monitoring despite close error...');
          }
        }
      }

    } catch (err) {
      console.error('Error during monitor tick:', err?.message ?? err);
    }

    await new Promise(r => setTimeout(r, intervalSeconds * 1_000));
  }

  console.log('Monitoring ended.');
}

async function main() {
    const userKeypair = loadWalletKeypair(WALLET_PATH);
    const connection  = new Connection(RPC_URL, 'confirmed');
  
    console.log('🚀 Welcome to MeteorShower DLMM Bot!');
    
    // 🏊 Prompt for pool address
    const poolAddress = await promptPoolAddress();
    
    if (poolAddress === null) {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    // ⚡ Prompt for liquidity strategy
    const liquidityStrategy = await promptLiquidityStrategy();
    
    if (liquidityStrategy === null) {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }
    
    // 💰 Prompt for SOL amount to use
    const solAmount = await promptSolAmount();
    
    if (solAmount === null) {
      console.log('❌ Operation cancelled or insufficient balance.');
      process.exit(0);
    }

    console.log(`✅ Using ${solAmount.toFixed(6)} SOL for liquidity position`);
    
    // ⚖️ Get pool info for token symbols and prompt for ratio
    console.log('📊 Getting pool information...');
    const DLMM = dlmmPackage.default ?? dlmmPackage;
    
    const poolPK = new PublicKey(poolAddress);
    const dlmmPool = await DLMM.create(connection, poolPK);
    
    // Determine token symbols (simplified for SOL pools)
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const tokenXMint = dlmmPool.tokenX.publicKey.toString();
    const tokenYMint = dlmmPool.tokenY.publicKey.toString();
    
    const tokenXSymbol = tokenXMint === SOL_MINT ? 'SOL' : 'TokenX';
    const tokenYSymbol = tokenYMint === SOL_MINT ? 'SOL' : 'TokenY';
    
    // If it's not a SOL pair, get more generic names
    const poolInfo = {
      tokenXSymbol: tokenXSymbol === 'TokenX' ? `Token (${tokenXMint.slice(0, 4)}...)` : tokenXSymbol,
      tokenYSymbol: tokenYSymbol === 'TokenY' ? `Token (${tokenYMint.slice(0, 4)}...)` : tokenYSymbol
    };
    
    const tokenRatio = await promptTokenRatio(poolInfo);
    
    if (tokenRatio === null) {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    console.log(`✅ Token allocation: ${(tokenRatio.ratioX * 100).toFixed(1)}% ${poolInfo.tokenXSymbol} / ${(tokenRatio.ratioY * 100).toFixed(1)}% ${poolInfo.tokenYSymbol}`);
    
    // 📊 Get bin step and prompt for bin span
    const binStep = dlmmPool?.lbPair?.binStep ?? dlmmPool?.binStep ?? dlmmPool?.stepBp ?? dlmmPool?.stepBP ?? 25;
    console.log('📊 Configuring position range...');
    
    const binSpanInfo = await promptBinSpan({ 
      binStep, 
      tokenXSymbol: poolInfo.tokenXSymbol, 
      tokenYSymbol: poolInfo.tokenYSymbol 
    });
    
    if (binSpanInfo === null) {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    console.log(`✅ Bin configuration: ${binSpanInfo.binSpan} bins (${binSpanInfo.coverage}% price coverage)`);
    
    // 🔄 Prompt for swapless rebalancing option
    console.log('🔄 Configuring rebalancing strategy...');
    
    const swaplessConfig = await promptSwaplessRebalance();
    
    if (swaplessConfig === null) {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    if (swaplessConfig.enabled) {
      console.log(`✅ Swapless rebalancing enabled with ${swaplessConfig.binSpan} bin span`);
    } else {
      console.log('✅ Normal rebalancing enabled (maintains token ratios with swaps)');
    }
    
    // 💰 Prompt for auto-compound settings
    console.log('💰 Configuring fee compounding...');
    
    const autoCompoundConfig = await promptAutoCompound();
    
    if (autoCompoundConfig === null) {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    if (autoCompoundConfig.enabled) {
      console.log('✅ Auto-compounding enabled - fees will be reinvested automatically');
    } else {
      console.log('✅ Auto-compounding disabled - fees kept separate from position');
    }
    
    // 🎯 Prompt for Take Profit & Stop Loss settings
    console.log('🎯 Configuring exit conditions...');
    
    const tpslConfig = await promptTakeProfitStopLoss();
    
    if (tpslConfig === null) {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    if (tpslConfig.takeProfitEnabled || tpslConfig.stopLossEnabled) {
      console.log('✅ Exit conditions configured - bot will auto-close when triggered');
      if (tpslConfig.takeProfitEnabled) {
        console.log(`   📈 Take Profit: +${tpslConfig.takeProfitPercentage}%`);
      }
      if (tpslConfig.stopLossEnabled) {
        console.log(`   📉 Stop Loss: -${tpslConfig.stopLossPercentage}%`);
      }
    } else {
      console.log('✅ No exit conditions - bot will run until manually stopped');
    }
    
    // Calculate bin distribution for display
    const binsForSOL = Math.floor(binSpanInfo.binSpan * tokenRatio.ratioX);
    const binsForToken = Math.floor(binSpanInfo.binSpan * (1 - tokenRatio.ratioX));
    const solCoverage = (binsForSOL * binStep / 100).toFixed(2);
    const tokenCoverage = (binsForToken * binStep / 100).toFixed(2);
    
    console.log('');
    console.log('📍 Position Configuration Summary:');
    console.log('==================================');
    console.log(`💰 Capital: ${solAmount.toFixed(6)} SOL`);
    console.log(`⚖️  Ratio: ${(tokenRatio.ratioX * 100).toFixed(1)}% ${poolInfo.tokenXSymbol} / ${(tokenRatio.ratioY * 100).toFixed(1)}% ${poolInfo.tokenYSymbol}`);
    console.log(`📊 Bin Span: ${binSpanInfo.binSpan} bins (${binSpanInfo.coverage}% total coverage)`);
    console.log(`   - ${poolInfo.tokenXSymbol} Bins: ${binsForSOL} bins below active price (-${solCoverage}% range)`);
    console.log(`   - ${poolInfo.tokenYSymbol} Bins: ${binsForToken} bins above active price (+${tokenCoverage}% range)`);
    console.log('');
    
    // 1️⃣ Open initial position
    const {
      dlmmPool: finalPool,
      initialCapitalUsd,
      positionPubKey,
      openFeeLamports
    } = await openDlmmPosition(connection, userKeypair, solAmount, tokenRatio, binSpanInfo.binSpan, poolAddress, liquidityStrategy);
  
    if (!finalPool || !positionPubKey) {
      console.error("Failed to open position – aborting.");
      process.exit(1);
    }
  
    // 2️⃣ Start monitoring & rebalancing with original parameters
    const originalParams = {
      solAmount,
      tokenRatio,
      binSpan: binSpanInfo.binSpan,
      poolAddress,
      liquidityStrategy,
      swaplessConfig,
      autoCompoundConfig,
      takeProfitEnabled: tpslConfig.takeProfitEnabled,
      takeProfitPercentage: tpslConfig.takeProfitPercentage,
      stopLossEnabled: tpslConfig.stopLossEnabled,
      stopLossPercentage: tpslConfig.stopLossPercentage
    };
    
    await monitorPositionLoop(
      connection,
      finalPool,
      userKeypair,
      initialCapitalUsd,
      positionPubKey,
      MONITOR_INTERVAL_SECONDS,
      originalParams
    );
  
    console.log("🏁 Script finished.");
  }
  
  main().catch(err => {
    console.error("💥 Unhandled error in main:", err);
    process.exit(1);
  });
export { main, monitorPositionLoop };