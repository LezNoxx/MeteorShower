// Bot Configuration Generator
// ==========================

class BotConfigGenerator {
    constructor() {
        this.config = {};
    }

    // Génération du fichier .env
    generateEnvFile(config) {
        const timestamp = new Date().toLocaleString('fr-FR');
        
        return `# Configuration MeteorShower Bot
# Généré automatiquement le ${timestamp}
# ================================================

# ────────────────────────── Network / RPC ──────────────────────────
# Point de terminaison RPC Solana
RPC_URL=${config.rpcUrl}

# ───────────────────────── Wallet / Keys ───────────────────────────
# Chemin vers le fichier de clés du wallet (sera créé automatiquement)
WALLET_PATH=./wallet.json

# ──────────────────────── Pool Configuration ───────────────────────
# Adresse du pool DLMM Meteora
POOL_ADDRESS=${config.poolAddress}

# Nombre total de bins dans la position
TOTAL_BINS_SPAN=${config.binSpan}

# Coefficient pour la répartition des bins (0.5 = symétrique)
LOWER_COEF=0.5

# Type de stratégie de liquidité
LIQUIDITY_STRATEGY_TYPE=${config.strategy}

# ─────────────────────── Trading Parameters ─────────────────────
# Allocation des tokens (ratio personnalisé)
${this.generateTokenRatioConfig(config.allocation)}

# ─────────────────────── Fee & Priority Tuning ─────────────────────
# Frais de priorité en micro-lamports
PRIORITY_FEE_MICRO_LAMPORTS=${config.priorityFee}

# Buffer SOL pour les frais (en lamports)
SOL_FEE_BUFFER_LAMPORTS=70000000

# Impact de prix maximum accepté (%)
PRICE_IMPACT=${config.priceImpact || 0.5}

# Slippage maximum (en basis points)
SLIPPAGE=${config.slippage || 10}

# ─────────────────────── Monitoring Settings ─────────────────────
# Intervalle de surveillance en secondes
MONITOR_INTERVAL_SECONDS=${config.monitorInterval}

# Intervalle de vérification P&L en secondes
PNL_CHECK_INTERVAL_SECONDS=${Math.min(config.monitorInterval, 10)}

# ─────────────────────── Risk Management ─────────────────────
${this.generateRiskManagementConfig(config)}

# ─────────────────────── Advanced Features ─────────────────────
${this.generateAdvancedFeaturesConfig(config)}

# ───────────────────────── Logging / Misc ──────────────────────────
# Niveau de log (fatal, error, warn, info, debug, trace)
LOG_LEVEL=info

# Mode manuel (true pour utiliser les paramètres définis)
MANUAL=true

# ─────────────────────── API Configuration ─────────────────────
# API Dither Alpha (optionnel)
DITHER_ALPHA_API=http://0.0.0.0:8000/metrics

# Période de lookback pour l'analyse (jours)
LOOKBACK=30
`;
    }

    // Génération du fichier wallet.json
    generateWalletFile(wallet) {
        if (!wallet || !wallet.privateKey) {
            throw new Error('Wallet invalide pour la génération du fichier');
        }

        return JSON.stringify(wallet.privateKey, null, 2);
    }

    // Génération du script de lancement
    generateLaunchScript(config) {
        const isWindows = navigator.platform.toLowerCase().includes('win');
        const extension = isWindows ? '.bat' : '.sh';
        const shebang = isWindows ? '@echo off' : '#!/bin/bash';
        const nodeCmd = 'node';

        return `${shebang}
${isWindows ? '' : ''}
echo "🌟 Démarrage de MeteorShower Bot"
echo "================================"
echo ""

${isWindows ? 'if not exist ".env" (' : 'if [ ! -f ".env" ]; then'}
    echo "❌ Fichier .env manquant!"
    echo "Veuillez placer le fichier .env généré dans ce dossier."
    ${isWindows ? 'pause' : 'read -p "Appuyez sur Entrée pour continuer..."'}
    exit 1
${isWindows ? ')' : 'fi'}

${isWindows ? 'if not exist "wallet.json" (' : 'if [ ! -f "wallet.json" ]; then'}
    echo "❌ Fichier wallet.json manquant!"
    echo "Veuillez placer le fichier wallet.json généré dans ce dossier."
    ${isWindows ? 'pause' : 'read -p "Appuyez sur Entrée pour continuer..."'}
    exit 1
${isWindows ? ')' : 'fi'}

echo "✅ Vérification des fichiers terminée"
echo ""
echo "Configuration:"
echo "  - Pool: ${config.poolAddress}"
echo "  - Capital: ${config.solAmount} SOL"
echo "  - Stratégie: ${config.strategy}"
echo "  - Intervalle: ${config.monitorInterval}s"
echo ""

${isWindows ? 'set /p confirm="Démarrer le bot? (y/N): "' : 'read -p "Démarrer le bot? (y/N): " confirm'}
${isWindows ? 'if /i "%confirm%" neq "y" exit /b' : 'if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then exit 1; fi'}

echo ""
echo "🚀 Lancement du bot..."
${nodeCmd} cli.js run --interval ${config.monitorInterval}

${isWindows ? 'pause' : ''}
`;
    }

    // Génération de la configuration des ratios de tokens
    generateTokenRatioConfig(allocation) {
        const tokenXPercent = 100 - allocation;
        const tokenYPercent = allocation;
        
        if (tokenXPercent === 100) {
            return `# Allocation: 100% Token X (SOL)
TOKEN_RATIO=SOL_ONLY`;
        } else if (tokenYPercent === 100) {
            return `# Allocation: 100% Token Y
TOKEN_RATIO=TOKEN_ONLY`;
        } else if (tokenXPercent === 50 && tokenYPercent === 50) {
            return `# Allocation: 50/50 équilibrée
TOKEN_RATIO=BALANCED`;
        } else {
            return `# Allocation personnalisée: ${tokenXPercent}% Token X / ${tokenYPercent}% Token Y
TOKEN_RATIO=CUSTOM
TOKEN_X_RATIO=${tokenXPercent / 100}
TOKEN_Y_RATIO=${tokenYPercent / 100}`;
        }
    }

    // Génération de la configuration de gestion des risques
    generateRiskManagementConfig(config) {
        let riskConfig = '';
        
        if (config.takeProfitEnabled) {
            riskConfig += `# Take Profit activé
TAKE_PROFIT_ENABLED=true
TAKE_PROFIT_PERCENT=${config.takeProfitPercent}
`;
        } else {
            riskConfig += `# Take Profit désactivé
# TAKE_PROFIT_ENABLED=false
# TAKE_PROFIT_PERCENT=15
`;
        }

        if (config.stopLossEnabled) {
            riskConfig += `
# Stop Loss activé
STOP_LOSS_ENABLED=true
STOP_LOSS_PERCENT=${config.stopLossPercent}`;
        } else {
            riskConfig += `
# Stop Loss désactivé
# STOP_LOSS_ENABLED=false
# STOP_LOSS_PERCENT=10`;
        }

        return riskConfig;
    }

    // Génération de la configuration des fonctionnalités avancées
    generateAdvancedFeaturesConfig(config) {
        let advancedConfig = '';

        // Swapless Rebalancing
        if (config.swaplessRebalance) {
            advancedConfig += `# Rééquilibrage sans swap activé
SWAPLESS_REBALANCE=true
SWAPLESS_BIN_SPAN=${config.swaplessBinSpan}
`;
        } else {
            advancedConfig += `# Rééquilibrage sans swap désactivé
# SWAPLESS_REBALANCE=false
# SWAPLESS_BIN_SPAN=15
`;
        }

        // Auto-Compound
        if (config.autoCompound) {
            advancedConfig += `
# Auto-composition activée
AUTO_COMPOUND=true`;
        } else {
            advancedConfig += `
# Auto-composition désactivée
# AUTO_COMPOUND=false`;
        }

        return advancedConfig;
    }

    // Génération du fichier README pour l'utilisateur
    generateReadme(config) {
        return `# Configuration MeteorShower Bot

## 📋 Résumé de votre configuration

**Pool sélectionné:** ${config.poolAddress}
**Capital:** ${config.solAmount} SOL
**Allocation:** ${100 - config.allocation}% / ${config.allocation}%
**Stratégie:** ${config.strategy}
**Bin Span:** ${config.binSpan} bins

### 🎯 Gestion des risques
- **Take Profit:** ${config.takeProfitEnabled ? `✅ ${config.takeProfitPercent}%` : '❌ Désactivé'}
- **Stop Loss:** ${config.stopLossEnabled ? `✅ ${config.stopLossPercent}%` : '❌ Désactivé'}

### 🔧 Fonctionnalités avancées
- **Rééquilibrage sans swap:** ${config.swaplessRebalance ? '✅ Activé' : '❌ Désactivé'}
- **Auto-composition:** ${config.autoCompound ? '✅ Activé' : '❌ Désactivé'}

## 🚀 Instructions de démarrage

1. **Placez les fichiers dans le dossier du bot:**
   - \`.env\` - Configuration du bot
   - \`wallet.json\` - Clés de votre wallet
   - \`start-bot${navigator.platform.toLowerCase().includes('win') ? '.bat' : '.sh'}\` - Script de lancement

2. **Vérifiez que Node.js est installé:**
   \`\`\`bash
   node --version
   \`\`\`

3. **Installez les dépendances (si pas déjà fait):**
   \`\`\`bash
   npm install
   \`\`\`

4. **Lancez le bot:**
   ${navigator.platform.toLowerCase().includes('win') ? 
     '- Double-cliquez sur `start-bot.bat`' : 
     '- Exécutez `./start-bot.sh` ou `bash start-bot.sh`'}

## ⚠️ Sécurité

- **Ne partagez jamais votre fichier wallet.json**
- **Sauvegardez votre clé privée en lieu sûr**
- **Testez avec de petits montants d'abord**

## 📞 Support

En cas de problème:
1. Vérifiez les logs du bot
2. Consultez la documentation sur GitHub
3. Vérifiez votre connexion RPC

---
*Configuration générée le ${new Date().toLocaleString('fr-FR')}*
`;
    }

    // Validation de la configuration
    validateConfig(config) {
        const errors = [];

        if (!config.rpcUrl) {
            errors.push('URL RPC manquante');
        }

        if (!config.wallet || !config.wallet.privateKey) {
            errors.push('Wallet invalide');
        }

        if (!config.poolAddress || config.poolAddress.length < 43) {
            errors.push('Adresse de pool invalide');
        }

        if (!config.solAmount || config.solAmount <= 0) {
            errors.push('Montant SOL invalide');
        }

        if (!config.binSpan || config.binSpan < 3) {
            errors.push('Bin span invalide (minimum 3)');
        }

        if (!config.strategy) {
            errors.push('Stratégie manquante');
        }

        if (config.takeProfitEnabled && (!config.takeProfitPercent || config.takeProfitPercent <= 0)) {
            errors.push('Pourcentage take profit invalide');
        }

        if (config.stopLossEnabled && (!config.stopLossPercent || config.stopLossPercent <= 0)) {
            errors.push('Pourcentage stop loss invalide');
        }

        return errors;
    }

    // Génération d'un package complet
    generateCompletePackage(config) {
        const errors = this.validateConfig(config);
        if (errors.length > 0) {
            throw new Error('Configuration invalide: ' + errors.join(', '));
        }

        return {
            env: this.generateEnvFile(config),
            wallet: this.generateWalletFile(config.wallet),
            launcher: this.generateLaunchScript(config),
            readme: this.generateReadme(config)
        };
    }
}

// Export pour utilisation globale
window.BotConfigGenerator = BotConfigGenerator;