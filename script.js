// Global state
let currentStep = 1;
let connection = null;
let selectedPool = null;
let botConfig = {};
let currentWallet = null;
let walletData = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    updateStepVisibility();
    loadSavedWallet();
});

// Event Listeners Setup
function setupEventListeners() {
    // Wallet management
    document.getElementById('createWallet').addEventListener('click', () => openWalletModal('create'));
    document.getElementById('importWallet').addEventListener('click', () => openWalletModal('import'));
    document.getElementById('closeModal').addEventListener('click', closeWalletModal);
    document.getElementById('generateWallet').addEventListener('click', generateNewWallet);
    document.getElementById('importWalletBtn').addEventListener('click', importWallet);
    document.getElementById('useWallet').addEventListener('click', useGeneratedWallet);
    document.getElementById('downloadWallet').addEventListener('click', downloadWalletFile);
    document.getElementById('copyAddress').addEventListener('click', () => copyToClipboard(document.getElementById('generatedAddress').textContent));
    document.getElementById('copyPrivateKey').addEventListener('click', () => copyToClipboard(document.getElementById('generatedPrivateKey').value));
    document.getElementById('copyCurrentAddress').addEventListener('click', () => copyToClipboard(document.getElementById('currentWalletAddress').textContent));
    document.getElementById('refreshBalance').addEventListener('click', updateWalletBalance);
    document.getElementById('exportWallet').addEventListener('click', exportCurrentWallet);
    document.getElementById('disconnectWallet').addEventListener('click', disconnectWallet);
    
    // Import method selection
    document.getElementById('importMethod').addEventListener('change', handleImportMethodChange);
    
    // RPC presets
    document.getElementById('rpcPresets').addEventListener('change', handleRpcPresetChange);
    
    // Step navigation
    document.getElementById('testConnection').addEventListener('click', testConnection);
    document.getElementById('nextStep1').addEventListener('click', () => goToStep(2));
    document.getElementById('prevStep2').addEventListener('click', () => goToStep(1));
    document.getElementById('nextStep2').addEventListener('click', () => goToStep(3));
    document.getElementById('prevStep3').addEventListener('click', () => goToStep(2));
    document.getElementById('nextStep3').addEventListener('click', () => goToStep(4));
    document.getElementById('prevStep4').addEventListener('click', () => goToStep(3));
    document.getElementById('nextStep4').addEventListener('click', () => goToStep(5));
    document.getElementById('prevStep5').addEventListener('click', () => goToStep(4));
    document.getElementById('launchBot').addEventListener('click', launchBot);
    
    // Pool selection
    document.querySelectorAll('.pool-card').forEach(card => {
        card.addEventListener('click', () => selectPool(card.dataset.pool));
    });
    
    document.getElementById('customPool').addEventListener('input', handleCustomPoolInput);
    
    // Configuration inputs
    document.getElementById('rpcUrl').addEventListener('input', handleRpcUrlChange);
    document.getElementById('solAmount').addEventListener('input', updateCapitalDisplay);
    document.getElementById('allocationSlider').addEventListener('input', updateAllocationDisplay);
    document.getElementById('binSpan').addEventListener('input', updateBinSpanDisplay);
    
    // Amount presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => setAmountPreset(btn.dataset.percent));
    });
    
    // Strategy selection
    document.querySelectorAll('.strategy-option').forEach(option => {
        option.addEventListener('click', () => selectStrategy(option.dataset.strategy));
    });
    
    // Risk management toggles
    document.getElementById('takeProfitEnabled').addEventListener('change', toggleTakeProfit);
    document.getElementById('stopLossEnabled').addEventListener('change', toggleStopLoss);
    document.getElementById('swaplessRebalance').addEventListener('change', toggleSwaplessRebalance);
    document.getElementById('autoCompound').addEventListener('change', toggleAutoCompound);
    
    // Bot controls
    document.getElementById('pauseBot').addEventListener('click', pauseBot);
    document.getElementById('stopBot').addEventListener('click', stopBot);
    
    // Modal click outside to close
    document.getElementById('walletModal').addEventListener('click', (e) => {
        if (e.target.id === 'walletModal') {
            closeWalletModal();
        }
    });
}

// Wallet Management Functions
function openWalletModal(mode) {
    const modal = document.getElementById('walletModal');
    const createForm = document.getElementById('createWalletForm');
    const importForm = document.getElementById('importWalletForm');
    const generatedResult = document.getElementById('walletGenerated');
    const modalTitle = document.getElementById('modalTitle');
    
    // Reset forms
    createForm.classList.add('hidden');
    importForm.classList.add('hidden');
    generatedResult.classList.add('hidden');
    
    if (mode === 'create') {
        modalTitle.textContent = 'Créer un nouveau wallet';
        createForm.classList.remove('hidden');
    } else {
        modalTitle.textContent = 'Importer un wallet';
        importForm.classList.remove('hidden');
    }
    
    modal.classList.remove('hidden');
}

function closeWalletModal() {
    document.getElementById('walletModal').classList.add('hidden');
    // Clear sensitive data
    document.getElementById('generatedPrivateKey').value = '';
    document.getElementById('privateKeyInput').value = '';
    document.getElementById('mnemonicInput').value = '';
}

async function generateNewWallet() {
    try {
        showLoading('Génération du wallet...');
        
        // Generate new keypair
        const keypair = window.solanaWeb3.Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const privateKey = Array.from(keypair.secretKey);
        
        // Store wallet data
        walletData = {
            publicKey,
            privateKey,
            name: document.getElementById('walletName').value || 'Mon Wallet DLMM'
        };
        
        // Update UI
        document.getElementById('generatedAddress').textContent = publicKey;
        document.getElementById('generatedPrivateKey').value = JSON.stringify(privateKey);
        
        // Show result
        document.getElementById('createWalletForm').classList.add('hidden');
        document.getElementById('walletGenerated').classList.remove('hidden');
        
        hideLoading();
        showToast('Wallet généré avec succès!', 'success');
        
    } catch (error) {
        hideLoading();
        showToast('Erreur lors de la génération du wallet: ' + error.message, 'error');
    }
}

async function importWallet() {
    try {
        showLoading('Import du wallet...');
        
        const method = document.getElementById('importMethod').value;
        let keypair;
        
        switch (method) {
            case 'privateKey':
                const privateKeyInput = document.getElementById('privateKeyInput').value.trim();
                if (!privateKeyInput) {
                    throw new Error('Veuillez entrer une clé privée');
                }
                
                let privateKeyArray;
                try {
                    privateKeyArray = JSON.parse(privateKeyInput);
                } catch {
                    // Try to decode as base58
                    try {
                        privateKeyArray = Array.from(window.bs58.decode(privateKeyInput));
                    } catch {
                        throw new Error('Format de clé privée invalide');
                    }
                }
                
                keypair = window.solanaWeb3.Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
                break;
                
            case 'mnemonic':
                const mnemonic = document.getElementById('mnemonicInput').value.trim();
                if (!mnemonic) {
                    throw new Error('Veuillez entrer une phrase mnémotechnique');
                }
                
                // For now, show error as mnemonic import requires additional libraries
                throw new Error('Import par phrase mnémotechnique non encore supporté. Utilisez la clé privée.');
                
            case 'keyfile':
                const fileInput = document.getElementById('keyfileInput');
                if (!fileInput.files[0]) {
                    throw new Error('Veuillez sélectionner un fichier');
                }
                
                const fileContent = await readFileAsText(fileInput.files[0]);
                const keyData = JSON.parse(fileContent);
                keypair = window.solanaWeb3.Keypair.fromSecretKey(new Uint8Array(keyData));
                break;
                
            default:
                throw new Error('Méthode d\'import non supportée');
        }
        
        // Store wallet data
        walletData = {
            publicKey: keypair.publicKey.toBase58(),
            privateKey: Array.from(keypair.secretKey),
            name: document.getElementById('importWalletName').value || 'Wallet Importé'
        };
        
        await useWallet(walletData);
        closeWalletModal();
        hideLoading();
        showToast('Wallet importé avec succès!', 'success');
        
    } catch (error) {
        hideLoading();
        showToast('Erreur lors de l\'import: ' + error.message, 'error');
    }
}

function useGeneratedWallet() {
    if (walletData) {
        useWallet(walletData);
        closeWalletModal();
        showToast('Wallet activé avec succès!', 'success');
    }
}

async function useWallet(wallet) {
    currentWallet = wallet;
    
    // Save to localStorage
    localStorage.setItem('meteorshower_wallet', JSON.stringify({
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey,
        name: wallet.name
    }));
    
    // Update UI
    updateWalletDisplay();
    await updateWalletBalance();
    
    // Update step validation
    updateNextStepButton();
}

function updateWalletDisplay() {
    if (currentWallet) {
        // Hide wallet creation buttons
        document.querySelector('.wallet-controls').style.display = 'none';
        
        // Show wallet info
        document.getElementById('walletInfo').classList.remove('hidden');
        document.querySelector('.wallet-address').textContent = 
            `${currentWallet.publicKey.slice(0, 4)}...${currentWallet.publicKey.slice(-4)}`;
        
        // Update wallet status
        document.getElementById('walletStatusDisplay').innerHTML = `
            <div class="status-item">
                <span class="status-icon">✅</span>
                <span>Wallet connecté: ${currentWallet.name}</span>
            </div>
        `;
        
        // Show wallet details
        document.getElementById('walletDetails').classList.remove('hidden');
        document.getElementById('currentWalletAddress').textContent = currentWallet.publicKey;
    }
}

async function updateWalletBalance() {
    if (!currentWallet || !connection) return;
    
    try {
        const publicKey = new window.solanaWeb3.PublicKey(currentWallet.publicKey);
        const balance = await connection.getBalance(publicKey);
        const solBalance = balance / window.solanaWeb3.LAMPORTS_PER_SOL;
        
        document.querySelector('.wallet-balance').textContent = `${solBalance.toFixed(4)} SOL`;
        document.getElementById('currentWalletBalance').textContent = `${solBalance.toFixed(4)} SOL`;
        document.getElementById('availableBalance').textContent = Math.max(0, solBalance - 0.07).toFixed(4);
        
    } catch (error) {
        console.error('Failed to get wallet balance:', error);
        document.querySelector('.wallet-balance').textContent = 'Erreur de chargement';
        document.getElementById('currentWalletBalance').textContent = 'Erreur';
    }
}

function loadSavedWallet() {
    const saved = localStorage.getItem('meteorshower_wallet');
    if (saved) {
        try {
            const wallet = JSON.parse(saved);
            currentWallet = wallet;
            updateWalletDisplay();
        } catch (error) {
            console.error('Failed to load saved wallet:', error);
            localStorage.removeItem('meteorshower_wallet');
        }
    }
}

function exportCurrentWallet() {
    if (!currentWallet) return;
    
    const walletData = {
        name: currentWallet.name,
        publicKey: currentWallet.publicKey,
        privateKey: currentWallet.privateKey
    };
    
    downloadJSON(walletData, `${currentWallet.name.replace(/\s+/g, '_')}_wallet.json`);
    showToast('Wallet exporté avec succès!', 'success');
}

function disconnectWallet() {
    if (confirm('Êtes-vous sûr de vouloir déconnecter ce wallet?')) {
        currentWallet = null;
        localStorage.removeItem('meteorshower_wallet');
        
        // Reset UI
        document.querySelector('.wallet-controls').style.display = 'flex';
        document.getElementById('walletInfo').classList.add('hidden');
        document.getElementById('walletDetails').classList.add('hidden');
        document.getElementById('walletStatusDisplay').innerHTML = `
            <div class="status-item">
                <span class="status-icon">❌</span>
                <span>Aucun wallet connecté</span>
            </div>
        `;
        
        updateNextStepButton();
        showToast('Wallet déconnecté', 'info');
    }
}

function downloadWalletFile() {
    if (!walletData) return;
    
    const filename = `${walletData.name.replace(/\s+/g, '_')}_wallet.json`;
    downloadJSON(walletData.privateKey, filename);
    showToast('Fichier wallet téléchargé!', 'success');
}

// RPC Configuration
function handleRpcPresetChange() {
    const preset = document.getElementById('rpcPresets').value;
    const rpcUrlInput = document.getElementById('rpcUrl');
    
    switch (preset) {
        case 'helius':
            rpcUrlInput.value = 'https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY';
            rpcUrlInput.classList.remove('hidden');
            break;
        case 'quicknode':
            rpcUrlInput.value = 'https://YOUR_ENDPOINT.solana-mainnet.quiknode.pro/YOUR_API_KEY/';
            rpcUrlInput.classList.remove('hidden');
            break;
        case 'alchemy':
            rpcUrlInput.value = 'https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY';
            rpcUrlInput.classList.remove('hidden');
            break;
        case 'custom':
            rpcUrlInput.value = '';
            rpcUrlInput.classList.remove('hidden');
            break;
        case '':
            rpcUrlInput.classList.add('hidden');
            break;
        default:
            rpcUrlInput.value = preset;
            rpcUrlInput.classList.add('hidden');
    }
    
    // Reset connection status
    document.getElementById('rpcStatus').innerHTML = 
        '<span class="status-icon">⏳</span><span>Connexion RPC: Non testée</span>';
    updateNextStepButton();
}

// Connection Testing
async function testConnection() {
    const rpcUrl = document.getElementById('rpcUrl').value || document.getElementById('rpcPresets').value;
    const testBtn = document.getElementById('testConnection');
    const rpcStatus = document.getElementById('rpcStatus');
    
    if (!rpcUrl || rpcUrl.includes('YOUR_API_KEY') || rpcUrl.includes('YOUR_ENDPOINT')) {
        showToast('Veuillez configurer une URL RPC valide', 'error');
        return;
    }
    
    testBtn.textContent = 'Test en cours...';
    testBtn.disabled = true;
    
    try {
        connection = new window.solanaWeb3.Connection(rpcUrl, 'confirmed');
        
        // Test the connection
        const version = await connection.getVersion();
        console.log('RPC Version:', version);
        
        // Update status
        rpcStatus.innerHTML = '<span class="status-icon">✅</span><span>Connexion RPC: Connectée</span>';
        
        // Update wallet balance if connected
        if (currentWallet) {
            await updateWalletBalance();
        }
        
        // Enable next step if wallet is also connected
        updateNextStepButton();
        showToast('Connexion RPC réussie!', 'success');
        
    } catch (error) {
        console.error('RPC connection failed:', error);
        rpcStatus.innerHTML = '<span class="status-icon">❌</span><span>Connexion RPC: Échec</span>';
        showToast('Échec de la connexion RPC: ' + error.message, 'error');
    } finally {
        testBtn.textContent = 'Tester la connexion';
        testBtn.disabled = false;
    }
}

function updateNextStepButton() {
    const rpcConnected = document.getElementById('rpcStatus').textContent.includes('Connectée');
    const walletConnected = currentWallet !== null;
    const nextBtn = document.getElementById('nextStep1');
    
    nextBtn.disabled = !(rpcConnected && walletConnected);
}

// Import method handling
function handleImportMethodChange() {
    const method = document.getElementById('importMethod').value;
    
    // Hide all import methods
    document.querySelectorAll('.import-method').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Show selected method
    document.getElementById(method + 'Import').classList.remove('hidden');
}

// Step Navigation
function goToStep(step) {
    // Validate current step before proceeding
    if (!validateCurrentStep()) {
        return;
    }
    
    currentStep = step;
    updateStepVisibility();
    updateProgressBar();
    
    // Update configuration summary if going to step 5
    if (step === 5) {
        updateConfigurationSummary();
    }
}

function updateStepVisibility() {
    document.querySelectorAll('.step-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const activeContent = document.querySelector(`[data-step="${currentStep}"]`);
    if (activeContent) {
        activeContent.classList.add('active');
    }
}

function updateProgressBar() {
    document.querySelectorAll('.progress-step').forEach(step => {
        const stepNumber = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        
        if (stepNumber === currentStep) {
            step.classList.add('active');
        } else if (stepNumber < currentStep) {
            step.classList.add('completed');
        }
    });
}

function validateCurrentStep() {
    switch (currentStep) {
        case 1:
            return document.getElementById('rpcStatus').textContent.includes('Connectée') &&
                   currentWallet !== null;
        case 2:
            const solAmount = parseFloat(document.getElementById('solAmount').value);
            return solAmount > 0 && solAmount >= 0.001;
        case 3:
            return selectedPool !== null;
        case 4:
            return true; // Risk management is optional
        default:
            return true;
    }
}

// Pool Selection
function selectPool(poolAddress) {
    selectedPool = poolAddress;
    
    // Update UI
    document.querySelectorAll('.pool-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    document.querySelector(`[data-pool="${poolAddress}"]`).classList.add('selected');
    
    // Clear custom pool input
    document.getElementById('customPool').value = '';
    
    // Load pool information
    loadPoolInfo(poolAddress);
    
    // Enable next step
    document.getElementById('nextStep3').disabled = false;
}

function handleCustomPoolInput(event) {
    const poolAddress = event.target.value.trim();
    
    if (poolAddress.length >= 43 && poolAddress.length <= 44) {
        // Clear selected pool cards
        document.querySelectorAll('.pool-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        selectedPool = poolAddress;
        loadPoolInfo(poolAddress);
        document.getElementById('nextStep3').disabled = false;
    } else {
        selectedPool = null;
        document.getElementById('poolInfo').classList.add('hidden');
        document.getElementById('nextStep3').disabled = true;
    }
}

async function loadPoolInfo(poolAddress) {
    try {
        // This would normally fetch from the DLMM SDK
        // For now, we'll show placeholder data
        const poolInfo = document.getElementById('poolInfo');
        
        // Show loading state
        document.getElementById('tokenX').textContent = 'Chargement...';
        document.getElementById('tokenY').textContent = 'Chargement...';
        document.getElementById('binStep').textContent = 'Chargement...';
        document.getElementById('activeBin').textContent = 'Chargement...';
        
        poolInfo.classList.remove('hidden');
        
        // Simulate API call
        setTimeout(() => {
            if (poolAddress === '6wJ7W3oHj7ex6MVFp2o26NSof3aey7U8Brs8E371WCXA') {
                document.getElementById('tokenX').textContent = 'SOL';
                document.getElementById('tokenY').textContent = 'USDC';
                document.getElementById('binStep').textContent = '25 bp';
                document.getElementById('activeBin').textContent = '8193';
            } else {
                document.getElementById('tokenX').textContent = 'Token X';
                document.getElementById('tokenY').textContent = 'Token Y';
                document.getElementById('binStep').textContent = '25 bp';
                document.getElementById('activeBin').textContent = 'Inconnu';
            }
        }, 1000);
        
    } catch (error) {
        console.error('Failed to load pool info:', error);
        document.getElementById('poolInfo').classList.add('hidden');
        showToast('Erreur lors du chargement des informations du pool', 'error');
    }
}

// Configuration Handlers
function handleRpcUrlChange() {
    // Reset connection status when URL changes
    document.getElementById('rpcStatus').innerHTML = 
        '<span class="status-icon">⏳</span><span>Connexion RPC: Non testée</span>';
    updateNextStepButton();
}

function updateCapitalDisplay() {
    const amount = parseFloat(document.getElementById('solAmount').value) || 0;
    const available = parseFloat(document.getElementById('availableBalance').textContent) || 0;
    
    // Update preset button states
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Validate amount
    const solAmountInput = document.getElementById('solAmount');
    if (amount > available) {
        solAmountInput.style.borderColor = '#ef4444';
        showToast('Montant supérieur au solde disponible', 'warning');
    } else {
        solAmountInput.style.borderColor = '#e5e7eb';
    }
}

function setAmountPreset(percent) {
    const available = parseFloat(document.getElementById('availableBalance').textContent) || 0;
    const amount = (available * parseInt(percent)) / 100;
    
    document.getElementById('solAmount').value = amount.toFixed(4);
    
    // Update button states
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    updateCapitalDisplay();
}

function updateAllocationDisplay() {
    const slider = document.getElementById('allocationSlider');
    const value = parseInt(slider.value);
    
    const tokenXPercent = 100 - value;
    const tokenYPercent = value;
    
    document.getElementById('tokenXLabel').textContent = `${tokenXPercent}% SOL`;
    document.getElementById('tokenYLabel').textContent = `${tokenYPercent}% USDC`;
}

function updateBinSpanDisplay() {
    const binSpan = parseInt(document.getElementById('binSpan').value) || 40;
    const binStep = 25; // This would come from pool info
    const coverage = (binSpan * binStep) / 100;
    
    document.getElementById('priceCoverage').textContent = `${coverage.toFixed(1)}%`;
}

function selectStrategy(strategy) {
    document.querySelectorAll('.strategy-option').forEach(option => {
        option.classList.remove('active');
    });
    
    document.querySelector(`[data-strategy="${strategy}"]`).classList.add('active');
    botConfig.strategy = strategy;
}

// Risk Management Toggles
function toggleTakeProfit() {
    const enabled = document.getElementById('takeProfitEnabled').checked;
    document.getElementById('takeProfitPercent').disabled = !enabled;
}

function toggleStopLoss() {
    const enabled = document.getElementById('stopLossEnabled').checked;
    document.getElementById('stopLossPercent').disabled = !enabled;
}

function toggleSwaplessRebalance() {
    const enabled = document.getElementById('swaplessRebalance').checked;
    const config = document.getElementById('swaplessConfig');
    
    if (enabled) {
        config.classList.remove('hidden');
    } else {
        config.classList.add('hidden');
    }
}

function toggleAutoCompound() {
    const enabled = document.getElementById('autoCompound').checked;
    botConfig.autoCompound = enabled;
}

// Configuration Summary
function updateConfigurationSummary() {
    const poolAddress = selectedPool;
    const solAmount = document.getElementById('solAmount').value;
    const allocation = document.getElementById('allocationSlider').value;
    const binSpan = document.getElementById('binSpan').value;
    const strategy = document.querySelector('.strategy-option.active')?.dataset.strategy || 'Spot';
    const takeProfitEnabled = document.getElementById('takeProfitEnabled').checked;
    const takeProfitPercent = document.getElementById('takeProfitPercent').value;
    const stopLossEnabled = document.getElementById('stopLossEnabled').checked;
    const stopLossPercent = document.getElementById('stopLossPercent').value;
    
    document.getElementById('summaryPool').textContent = 
        poolAddress === '6wJ7W3oHj7ex6MVFp2o26NSof3aey7U8Brs8E371WCXA' ? 'SOL/USDC' : 'Pool personnalisé';
    document.getElementById('summaryCapital').textContent = `${solAmount} SOL`;
    document.getElementById('summaryAllocation').textContent = `${100 - allocation}% / ${allocation}%`;
    document.getElementById('summaryBinSpan').textContent = `${binSpan} bins`;
    document.getElementById('summaryStrategy').textContent = strategy;
    document.getElementById('summaryTakeProfit').textContent = 
        takeProfitEnabled ? `+${takeProfitPercent}%` : 'Désactivé';
    document.getElementById('summaryStopLoss').textContent = 
        stopLossEnabled ? `-${stopLossPercent}%` : 'Désactivé';
}

// Bot Launch and Control
async function launchBot() {
    try {
        const launchBtn = document.getElementById('launchBot');
        launchBtn.textContent = 'Lancement...';
        launchBtn.disabled = true;
        
        // Collect all configuration
        botConfig = {
            rpcUrl: document.getElementById('rpcUrl').value || document.getElementById('rpcPresets').value,
            wallet: currentWallet,
            poolAddress: selectedPool,
            solAmount: parseFloat(document.getElementById('solAmount').value),
            allocation: parseInt(document.getElementById('allocationSlider').value),
            binSpan: parseInt(document.getElementById('binSpan').value),
            strategy: document.querySelector('.strategy-option.active')?.dataset.strategy || 'Spot',
            takeProfitEnabled: document.getElementById('takeProfitEnabled').checked,
            takeProfitPercent: parseFloat(document.getElementById('takeProfitPercent').value),
            stopLossEnabled: document.getElementById('stopLossEnabled').checked,
            stopLossPercent: parseFloat(document.getElementById('stopLossPercent').value),
            swaplessRebalance: document.getElementById('swaplessRebalance').checked,
            swaplessBinSpan: parseInt(document.getElementById('swaplessBinSpan').value),
            autoCompound: document.getElementById('autoCompound').checked,
            monitorInterval: parseInt(document.getElementById('monitorInterval').value),
            priorityFee: parseInt(document.getElementById('priorityFee').value)
        };
        
        console.log('Configuration du bot:', botConfig);
        
        // Generate .env file content
        const envContent = generateEnvFile(botConfig);
        
        // Download .env file
        downloadText(envContent, 'meteorshower.env');
        
        showToast('Configuration téléchargée! Utilisez le fichier .env avec le bot CLI.', 'success');
        
        // Switch to running view (simulation)
        currentStep = 'running';
        updateStepVisibility();
        
        // Start monitoring simulation
        startMonitoringSimulation();
        
    } catch (error) {
        console.error('Failed to launch bot:', error);
        showToast('Erreur lors du lancement: ' + error.message, 'error');
        
        const launchBtn = document.getElementById('launchBot');
        launchBtn.textContent = 'Lancer le bot';
        launchBtn.disabled = false;
    }
}

function generateEnvFile(config) {
    return `# Configuration MeteorShower Bot
# Généré le ${new Date().toLocaleString()}

# ────────────────────────── Network / RPC ──────────────────────────
RPC_URL=${config.rpcUrl}

# ───────────────────────── Wallet / Keys ───────────────────────────
WALLET_PATH=./wallet.json

# ──────────────────────── Pool Configuration ───────────────────────
POOL_ADDRESS=${config.poolAddress}
TOTAL_BINS_SPAN=${config.binSpan}
LOWER_COEF=0.5
LIQUIDITY_STRATEGY_TYPE=${config.strategy}

# ─────────────────────── Fee & Priority Tuning ─────────────────────
PRIORITY_FEE_MICRO_LAMPORTS=${config.priorityFee}
SOL_FEE_BUFFER_LAMPORTS=70000000
PRICE_IMPACT=0.5
SLIPPAGE=10

# Interval for monitoring (seconds)
MONITOR_INTERVAL_SECONDS=${config.monitorInterval}

# ───────────────────────── Logging / Misc ──────────────────────────
LOG_LEVEL=info
MANUAL=true

# ───────────────────────── Advanced Features ──────────────────────
${config.takeProfitEnabled ? `TAKE_PROFIT_PERCENT=${config.takeProfitPercent}` : '# TAKE_PROFIT_PERCENT=15'}
${config.stopLossEnabled ? `STOP_LOSS_PERCENT=${config.stopLossPercent}` : '# STOP_LOSS_PERCENT=10'}
${config.swaplessRebalance ? `SWAPLESS_REBALANCE=true` : '# SWAPLESS_REBALANCE=false'}
${config.swaplessRebalance ? `SWAPLESS_BIN_SPAN=${config.swaplessBinSpan}` : '# SWAPLESS_BIN_SPAN=15'}
${config.autoCompound ? `AUTO_COMPOUND=true` : '# AUTO_COMPOUND=false'}
`;
}

function startMonitoringSimulation() {
    let positionValue = botConfig.solAmount * 100; // Simulate $100/SOL
    let pnl = 0;
    let fees = 0;
    let rebalances = 0;
    
    setInterval(() => {
        // Simulate price changes
        const change = (Math.random() - 0.5) * 10; // ±$5 change
        positionValue += change;
        pnl = positionValue - (botConfig.solAmount * 100);
        fees += Math.random() * 0.5; // Random fee accumulation
        
        // Simulate occasional rebalances
        if (Math.random() < 0.1) {
            rebalances++;
        }
        
        // Update UI
        document.getElementById('positionValue').textContent = `$${positionValue.toFixed(2)}`;
        document.getElementById('pnlValue').textContent = 
            `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${((pnl / (botConfig.solAmount * 100)) * 100).toFixed(1)}%)`;
        document.getElementById('feesEarned').textContent = `$${fees.toFixed(2)}`;
        document.getElementById('rebalanceCount').textContent = rebalances.toString();
        
        // Update P&L color
        const pnlElement = document.getElementById('pnlValue');
        pnlElement.style.color = pnl >= 0 ? '#059669' : '#dc2626';
        
    }, 5000); // Update every 5 seconds
}

function pauseBot() {
    showToast('Bot mis en pause (simulation)', 'info');
}

function stopBot() {
    if (confirm('Êtes-vous sûr de vouloir arrêter le bot et fermer la position?')) {
        showToast('Bot arrêté et position fermée (simulation)', 'info');
        // Reset to step 1
        currentStep = 1;
        updateStepVisibility();
        updateProgressBar();
    }
}

// Utility Functions
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copié dans le presse-papiers!', 'success');
    }).catch(() => {
        showToast('Erreur lors de la copie', 'error');
    });
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    }[type] || 'ℹ️';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
    
    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    });
}

function showLoading(text = 'Chargement...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = overlay.querySelector('.loading-text');
    loadingText.textContent = text;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatNumber(num, decimals = 2) {
    return new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

// Error Handling
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showToast('Une erreur inattendue s\'est produite', 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('Erreur de promesse non gérée', 'error');
});