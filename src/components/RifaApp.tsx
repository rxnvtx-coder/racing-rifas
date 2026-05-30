// @ts-nocheck
"use client";
import React, { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export default function RifaApp() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        // Wait for app.js to be loaded by Next.js Script tag
        const checkApp = setInterval(() => {
            if (window.app && window.DEFAULTS && window.state) {
                clearInterval(checkApp);
                initFirebaseOverrides();
            }
        }, 50);

        function initFirebaseOverrides() {
            if (window.rifaFirebaseInitialized) return;
            window.rifaFirebaseInitialized = true;

            const app = window.app;
            const state = window.state;
            const DEFAULTS = window.DEFAULTS;

            app.loadLocalStorage = async function() {
                try {
                    const snapSettings = await getDoc(doc(db, 'rifa', 'settings'));
                    if(snapSettings.exists()) state.settings = snapSettings.data();
                    else {
                        state.settings = { ...DEFAULTS.settings };
                        await setDoc(doc(db, 'rifa', 'settings'), state.settings);
                    }

                    const snapNumbers = await getDoc(doc(db, 'rifa', 'numbers'));
                    if(snapNumbers.exists()) state.numbers = snapNumbers.data().data;
                    else state.numbers = [];

                    const snapSales = await getDoc(doc(db, 'rifa', 'sales'));
                    if(snapSales.exists()) state.sales = snapSales.data().data;
                    else state.sales = [];

                    if (state.numbers.length === 0) {
                        app.generateNumbers();
                        await app.saveState();
                    }

                    onSnapshot(doc(db, 'rifa', 'numbers'), (docSnap) => {
                        if(docSnap.exists() && state.numbers.length > 0) {
                            state.numbers = docSnap.data().data;
                            app.renderNumbersGrid();
                            app.updateCartUI();
                            app.updateProgress();
                        }
                    });

                    onSnapshot(doc(db, 'rifa', 'sales'), (docSnap) => {
                        if(docSnap.exists() && state.sales.length > 0) {
                            state.sales = docSnap.data().data;
                            if(state.isAdminLoggedIn) {
                                app.renderAdminSales();
                            }
                        }
                    });

                    onSnapshot(doc(db, 'rifa', 'settings'), (docSnap) => {
                        if(docSnap.exists()) {
                            state.settings = docSnap.data();
                            app.renderPublicUI();
                        }
                    });

                    app.renderPublicUI();
                    app.renderNumbersGrid();
                    app.updateProgress();
                    app.initCanvasHero();
                } catch (e) {
                    console.error("Firebase init error", e);
                }
            };

            app.saveState = async function() {
                try {
                    await setDoc(doc(db, 'rifa', 'numbers'), { data: state.numbers });
                    await setDoc(doc(db, 'rifa', 'sales'), { data: state.sales });
                } catch (e) {
                    console.error("Firebase save state error", e);
                }
            };

            app.saveSettings = async function(event) {
                if(event) event.preventDefault();
                state.settings.title = document.getElementById("setRifaTitle").value.trim();
                state.settings.description = document.getElementById("setRifaDesc").value.trim();
                state.settings.pixKey = document.getElementById("setPixKey").value.trim();
                state.settings.pixName = document.getElementById("setPixName").value.trim();
                state.settings.pixCity = document.getElementById("setPixCity").value.trim();
                state.settings.ticketPrice = document.getElementById("setTicketPrice").value;
                state.settings.prize1_title = document.getElementById("setPrizeTitle1").value.trim();
                state.settings.prize1_desc = document.getElementById("setPrizeDesc1").value.trim();
                state.settings.prize2_title = document.getElementById("setPrizeTitle2").value.trim();
                state.settings.prize2_desc = document.getElementById("setPrizeDesc2").value.trim();
                state.settings.prize3_title = document.getElementById("setPrizeTitle3").value.trim();
                state.settings.prize3_desc = document.getElementById("setPrizeDesc3").value.trim();
                const newPass = document.getElementById("setAdminPassword").value.trim();
                if (newPass) state.settings.adminPassword = newPass;

                try {
                    await setDoc(doc(db, 'rifa', 'settings'), state.settings);
                    app.renderPublicUI();
                    app.openModal('modalConfigSaved');
                } catch (e) {
                    console.error("Firebase save error", e);
                    alert("Erro ao salvar no BD.");
                }
            };

            app.init();
        }

    }, []);

    return (
        <div 
            ref={containerRef}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: `
    <!-- Canvas reativo de fundo da página inteira -->
    <canvas id="siteCanvasBackground" class="site-canvas-bg" aria-hidden="true"></canvas>

    <!-- ==========================================
         CABECALHO
         ========================================== -->
    <header>
        <div class="container" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div class="logo" style="display: flex; align-items: center; gap: 10px;">
                <img src="logo.png" alt="Racing Club de Curitiba Logo" style="height: 48px; width: auto; object-fit: contain;">
                <span>RacingRifas</span>
            </div>
            <button class="admin-trigger" id="btnAdminTrigger" onclick="app.openAdminLoginModal()">
                <i class="fa-solid fa-lock"></i>
                <span>Painel Organizador</span>
            </button>
        </div>
    </header>

    <!-- ==========================================
         GLOWY WAVES HERO SECTION (INTERATIVO COM CANVAS)
         ========================================== -->
    <section class="hero-section" aria-label="Seção Hero Interativa com Canvas">
        <!-- Blobs decorativos de desfoque -->
        <div class="hero-blur-decorations" aria-hidden="true">
            <div class="blur-blob-1"></div>
            <div class="blur-blob-2"></div>
        </div>

        <div class="hero-content">
            <!-- Badge superior -->
            <div class="hero-badge">
                <i class="fa-solid fa-sparkles"></i>
                <span>Rifa Digital Oficial</span>
            </div>

            <!-- Título do Hero -->
            <h1 class="hero-title" id="rifaTitle">
                Bem-vindo ao maior portal de <span>rifas digitais</span>
            </h1>

            <!-- Descrição -->
            <p class="hero-description" id="rifaDesc">
                Concorra a super prêmios incríveis com segurança e transparência! Sorteios oficiais baseados na Loteria Federal. Escolha suas cotas e participe!
            </p>

            <!-- Ações CTAs -->
            <div class="hero-actions">
                <button class="btn-hero-primary" onclick="document.getElementById('numbersSection').scrollIntoView({ behavior: 'smooth' })">
                    <span>Escolher Números</span>
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
                <button class="btn-hero-outline" onclick="app.openModal('modalConsultTickets')">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <span>Meus Números</span>
                </button>
            </div>

            <!-- Destaques flutuantes (Pills) -->
            <ul class="hero-pills">
                <li class="hero-pill-item">100% Seguro</li>
                <li class="hero-pill-item">Pix Automático</li>
                <li class="hero-pill-item">Sorteio Ao Vivo</li>
            </ul>

            <!-- Grid de Prêmios (Substitui estatísticas do Hero React) -->
            <div class="hero-prizes-grid">
                <!-- 1º Prêmio -->
                <div class="hero-prize-stat-card gold">
                    <div class="prize-stat-label">
                        <i class="fa-solid fa-trophy"></i>
                        <span>1º Ganhador</span>
                    </div>
                    <div class="prize-stat-value" id="prizeTitle1">PlayStation 5 Slim</div>
                    <div class="prize-stat-desc" id="prizeDesc1">O melhor videogame do mundo</div>
                </div>

                <!-- 2º Prêmio -->
                <div class="hero-prize-stat-card silver">
                    <div class="prize-stat-label">
                        <i class="fa-solid fa-medal"></i>
                        <span>2º Ganhador</span>
                    </div>
                    <div class="prize-stat-value" id="prizeTitle2">iPhone 15 Apple</div>
                    <div class="prize-stat-desc" id="prizeDesc2">Celular de última geração</div>
                </div>

                <!-- 3º Prêmio -->
                <div class="hero-prize-stat-card bronze">
                    <div class="prize-stat-label">
                        <i class="fa-solid fa-award"></i>
                        <span>3º Ganhador</span>
                    </div>
                    <div class="prize-stat-value" id="prizeTitle3">R\$ 1.000,00 no Pix</div>
                    <div class="prize-stat-desc" id="prizeDesc3">Dinheiro direto na sua conta</div>
                </div>
            </div>
        </div>
    </section>

    <!-- Conteúdo Principal -->
    <div class="container" id="numbersSection" style="scroll-margin-top: 100px;">
        
        <!-- ==========================================
             PROGRESSO DE VENDAS
             ========================================== -->
        <section class="progress-card">
            <div class="progress-header">
                <div class="progress-text">Progresso das Vendas: <span id="progressPercent">0%</span></div>
                <div class="progress-stats">
                    <span id="soldCountDisplay">0 / 100 Cotas</span>
                </div>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="progressBarFill"></div>
            </div>
        </section>

        <!-- ==========================================
             PAINEL ADMINISTRATIVO (OCULTO POR PADRÃO)
             ========================================== -->
        <section class="admin-panel" id="adminPanel">
            <div class="admin-header">
                <h2>
                    <i class="fa-solid fa-gauge-high"></i>
                    <span>Painel de Controle da Rifa</span>
                </h2>
                <button class="admin-close-btn" onclick="app.logoutAdmin()">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i> Sair do Painel
                </button>
            </div>

            <!-- Dashboard de Estatísticas -->
            <div class="admin-metrics">
                <div class="metric-card">
                    <div class="metric-icon revenue">
                        <i class="fa-solid fa-money-bill-trend-up"></i>
                    </div>
                    <div class="metric-info">
                        <h4>Total Recebido</h4>
                        <p id="metricRevenue">R\$ 0,00</p>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon pending">
                        <i class="fa-solid fa-clock"></i>
                    </div>
                    <div class="metric-info">
                        <h4>Reservas Pendentes</h4>
                        <p id="metricPending">R\$ 0,00</p>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon sold">
                        <i class="fa-solid fa-ticket"></i>
                    </div>
                    <div class="metric-info">
                        <h4>Cotas Vendidas (Pagas)</h4>
                        <p id="metricSold">0 / 100</p>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon percent">
                        <i class="fa-solid fa-chart-line"></i>
                    </div>
                    <div class="metric-info">
                        <h4>Taxa de Ocupação</h4>
                        <p id="metricPercent">0%</p>
                    </div>
                </div>
            </div>

            <!-- Abas do Admin -->
            <div class="admin-tabs">
                <button class="admin-tab-btn active" id="tabBtnSales" onclick="app.switchAdminTab('sales')">
                    <i class="fa-solid fa-list-check"></i> Vendas e Reservas
                </button>
                <button class="admin-tab-btn" id="tabBtnSettings" onclick="app.switchAdminTab('settings')">
                    <i class="fa-solid fa-gears"></i> Configurações da Rifa
                </button>
            </div>

            <!-- Aba 1: Vendas e Reservas -->
            <div class="admin-tab-content active" id="tabContentSales">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Comprador</th>
                                <th>WhatsApp</th>
                                <th>Números</th>
                                <th>Valor Total</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="salesTableBody">
                            <!-- Inserido dinamicamente via JS -->
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Aba 2: Configurações -->
            <div class="admin-tab-content" id="tabContentSettings">
                <form id="settingsForm" onsubmit="app.saveSettings(event)" class="settings-grid">
                    <div style="grid-column: span 2;">
                        <h3 class="section-title" style="font-size: 16px; margin-bottom: 16px; color: var(--primary-dark)">
                            <i class="fa-solid fa-pen-to-square"></i> Informações Gerais da Rifa
                        </h3>
                    </div>
                    <div class="form-group">
                        <label for="setRifaTitle">Título da Rifa</label>
                        <input type="text" id="setRifaTitle" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="setRifaDesc">Descrição / Data do Sorteio</label>
                        <input type="text" id="setRifaDesc" class="form-control" required>
                    </div>

                    <!-- Configurações do Pix do Organizador -->
                    <div style="grid-column: span 2; margin-top: 15px;">
                        <h3 class="section-title" style="font-size: 16px; margin-bottom: 16px; color: var(--primary-dark)">
                            <i class="fa-solid fa-qrcode"></i> Configurações do Pix (Recebimento Real)
                        </h3>
                        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px; margin-top: -10px;">
                            Insira os dados reais da sua conta Pix. O sistema usará esses dados para gerar o QR Code estático e o código "Copia e Cola" real com o valor exato no checkout.
                        </p>
                    </div>
                    <div class="form-group">
                        <label for="setPixKey">Chave Pix (CPF, CNPJ, Celular, E-mail ou Aleatória)</label>
                        <input type="text" id="setPixKey" class="form-control" placeholder="ex: 12345678909 ou chave-aleatoria" required>
                    </div>
                    <div class="form-group">
                        <label for="setPixName">Nome do Beneficiário (Sem acentos, máx 25 carac.)</label>
                        <input type="text" id="setPixName" class="form-control" placeholder="ex: Fulano de Tal" required>
                    </div>
                    <div class="form-group">
                        <label for="setPixCity">Cidade do Beneficiário (Sem acentos, máx 15 carac.)</label>
                        <input type="text" id="setPixCity" class="form-control" placeholder="ex: Sao Paulo" required>
                    </div>
                    <div class="form-group">
                        <label for="setTicketPrice">Preço por Cota / Número (R\$)</label>
                        <input type="number" id="setTicketPrice" class="form-control" min="1" step="0.01" required>
                    </div>

                    <!-- Detalhes dos Prêmios -->
                    <div style="grid-column: span 2; margin-top: 15px;">
                        <h3 class="section-title" style="font-size: 16px; margin-bottom: 16px; color: var(--primary-dark)">
                            <i class="fa-solid fa-trophy"></i> Detalhes dos 3 Prêmios (Exibidos na Barra Superior)
                        </h3>
                    </div>
                    <div class="form-group">
                        <label for="setPrizeTitle1">1º Prêmio (Título curto)</label>
                        <input type="text" id="setPrizeTitle1" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="setPrizeDesc1">1º Prêmio (Subtítulo)</label>
                        <input type="text" id="setPrizeDesc1" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="setPrizeTitle2">2º Prêmio (Título curto)</label>
                        <input type="text" id="setPrizeTitle2" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="setPrizeDesc2">2º Prêmio (Subtítulo)</label>
                        <input type="text" id="setPrizeDesc2" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="setPrizeTitle3">3º Prêmio (Título curto)</label>
                        <input type="text" id="setPrizeTitle3" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="setPrizeDesc3">3º Prêmio (Subtítulo)</label>
                        <input type="text" id="setPrizeDesc3" class="form-control" required>
                    </div>

                    <!-- Configurações de Segurança -->
                    <div style="grid-column: span 2; margin-top: 15px;">
                        <h3 class="section-title" style="font-size: 16px; margin-bottom: 16px; color: var(--primary-dark)">
                            <i class="fa-solid fa-shield-halved"></i> Segurança do Painel
                        </h3>
                    </div>
                    <div class="form-group">
                        <label for="setAdminPassword">Nova Senha do Administrador</label>
                        <input type="password" id="setAdminPassword" class="form-control" placeholder="Deixe em branco para não alterar">
                    </div>

                    <!-- Ações de Configuração -->
                    <div class="settings-actions">
                        <button type="button" class="btn-danger" onclick="app.resetRifaData()">
                            <i class="fa-solid fa-triangle-exclamation"></i> Limpar Rifa (Zerar Vendas)
                        </button>
                        <button type="submit" class="checkout-btn" style="width: auto; min-width: 200px;">
                            <i class="fa-solid fa-floppy-disk"></i> Salvar Configurações
                        </button>
                    </div>
                </form>
            </div>
        </section>

        <!-- ==========================================
             SELEÇÃO E CARRINHO
             ========================================== -->
        <main class="rifa-section">
            
            <!-- Esquerda: Grade de Seleção de Números -->
            <section class="numbers-container">
                <div class="filters-bar">
                    <div class="filter-tabs">
                        <button class="filter-btn active" id="filterBtnAll" onclick="app.filterNumbers('all')">Todos</button>
                        <button class="filter-btn" id="filterBtnAvailable" onclick="app.filterNumbers('available')">Disponíveis</button>
                        <button class="filter-btn" id="filterBtnReserved" onclick="app.filterNumbers('reserved')">Reservados</button>
                        <button class="filter-btn" id="filterBtnPaid" onclick="app.filterNumbers('paid')">Confirmados</button>
                    </div>
                    <div class="search-number-wrapper">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" id="searchNumber" class="search-number-input" placeholder="Buscar número..." oninput="app.searchNumber()">
                    </div>
                </div>

                <div class="legend-bar">
                    <div class="legend-item">
                        <div class="legend-dot available"></div>
                        <span>Disponível</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-dot selected"></div>
                        <span>Selecionado</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-dot reserved"></div>
                        <span>Reservado</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-dot paid"></div>
                        <span>Confirmado</span>
                    </div>
                </div>

                <!-- A grade de 100 números será injetada aqui -->
                <div class="numbers-grid" id="numbersGrid">
                    <!-- Gerado dinamicamente -->
                </div>
            </section>

            <!-- Direita: Carrinho e Formulário de Compras -->
            <aside class="sidebar-checkout">
                <h3 class="cart-title">
                    <i class="fa-solid fa-cart-shopping"></i>
                    <span>Cotas Selecionadas</span>
                </h3>

                <!-- Estado Vazio -->
                <div class="cart-empty" id="cartEmpty">
                    <i class="fa-solid fa-receipt"></i>
                    <p>Nenhum número selecionado ainda. Clique nos números disponíveis para começar!</p>
                </div>

                <!-- Carrinho Ativo -->
                <div class="cart-content" id="cartContent" style="display: none;">
                    <div class="cart-numbers-selected" id="cartSelectedNumbers">
                        <!-- Badges dinâmicos -->
                    </div>
                    
                    <div class="cart-divider"></div>

                    <div>
                        <div class="cart-summary-row">
                            <span>Quantidade</span>
                            <span id="cartCount">0 cotas</span>
                        </div>
                        <div class="cart-summary-row">
                            <span>Valor Unitário</span>
                            <span id="cartUnitPrice">R\$ 30,00</span>
                        </div>
                        <div class="cart-summary-row total">
                            <span>Valor Total</span>
                            <span id="cartTotalPrice">R\$ 0,00</span>
                        </div>
                    </div>

                    <div class="cart-divider"></div>

                    <!-- Formulário do Comprador -->
                    <form id="checkoutForm" onsubmit="app.processCheckout(event)">
                        <div class="form-group">
                            <label for="buyerName">Nome Completo</label>
                            <input type="text" id="buyerName" class="form-control" placeholder="ex: João Silva" required>
                        </div>
                        <div class="form-group">
                            <label for="buyerPhone">WhatsApp (com DDD)</label>
                            <input type="tel" id="buyerPhone" class="form-control" placeholder="ex: (11) 99999-9999" required>
                        </div>
                        <button type="submit" class="checkout-btn" id="btnFinalize">
                            <i class="fa-solid fa-lock"></i> Reservar e Pagar via Pix
                        </button>
                    </form>
                </div>
            </aside>
        </main>
    </div>

    <!-- ==========================================
         MODAIS
         ========================================== -->

    <!-- 1. Modal de Consulta de Números (Meus Números) -->
    <div class="modal-overlay" id="modalConsultTickets">
        <div class="modal-card">
            <div class="modal-header">
                <h3><i class="fa-solid fa-magnifying-glass"></i> Consultar Minhas Cotas</h3>
                <button class="modal-close" onclick="app.closeModal('modalConsultTickets')">&times;</button>
            </div>
            <div class="modal-body">
                <form id="consultTicketsForm" onsubmit="app.consultTickets(event)">
                    <div class="form-group">
                        <label for="consultPhone">Digite o seu WhatsApp (com DDD)</label>
                        <input type="tel" id="consultPhone" class="form-control" placeholder="ex: (11) 99999-9999" required>
                    </div>
                    <button type="submit" class="checkout-btn">
                        <i class="fa-solid fa-search"></i> Buscar Cotas
                    </button>
                </form>

                <!-- Box com os resultados da consulta -->
                <div class="consultation-result-box" id="consultResultBox">
                    <div class="consult-user-title" id="consultUserTitle"></div>
                    <div class="consult-tickets-list" id="consultTicketsList">
                        <!-- Badges dinâmicos dos números encontrados -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 2. Modal de Login do Administrador -->
    <div class="modal-overlay" id="modalAdminLogin">
        <div class="modal-card">
            <div class="modal-header">
                <h3><i class="fa-solid fa-shield-halved"></i> Área de Acesso</h3>
                <button class="modal-close" onclick="app.closeModal('modalAdminLogin')">&times;</button>
            </div>
            <div class="modal-body">
                <form id="adminLoginForm" onsubmit="app.loginAdmin(event)">
                    <div class="form-group">
                        <label for="adminPassword">Senha do Organizador</label>
                        <input type="password" id="adminPassword" class="form-control" placeholder="Digite a senha de administrador" required autofocus>
                    </div>
                    <button type="submit" class="checkout-btn">
                        <i class="fa-solid fa-arrow-right-to-bracket"></i> Acessar Painel
                    </button>
                </form>
            </div>
        </div>
    </div>

    <!-- 3. Modal de Checkout / Pix -->
    <div class="modal-overlay" id="modalCheckoutPix">
        <div class="modal-card" style="max-width: 480px;">
            <div class="modal-header">
                <h3><i class="fa-solid fa-circle-dollar-to-slot"></i> Pagamento via Pix</h3>
                <button class="modal-close" onclick="app.closeModal('modalCheckoutPix')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="checkout-pix-container">
                    
                    <div class="timer-box">
                        <i class="fa-solid fa-clock"></i>
                        <span>Reserva expira em: <strong id="pixTimer">15:00</strong></span>
                    </div>

                    <p style="font-size: 14px; color: var(--text-muted);">
                        Escaneie o QR Code abaixo no aplicativo do seu banco ou copie a chave Pix para realizar o pagamento.
                    </p>

                    <!-- Renderização do QR Code Pix -->
                    <div class="qr-code-wrapper">
                        <img id="pixQrCodeImg" src="" alt="Carregando QR Code Pix...">
                    </div>

                    <!-- Código Copia e Cola -->
                    <div class="pix-code-container">
                        <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px; text-align: left;">
                            Código Pix Copia e Cola
                        </label>
                        <div class="pix-copy-box">
                            <input type="text" id="pixCopiaCola" class="pix-input-readonly" readonly value="Gerando código Pix...">
                            <button type="button" class="btn-copy-pix" onclick="app.copyPixCode()" id="btnCopyPixText">
                                <i class="fa-solid fa-copy"></i> Copiar
                            </button>
                        </div>
                        <p class="pix-instructions">Após copiar, abra o app do seu banco e escolha "Pix Copia e Cola".</p>
                    </div>

                    <div class="cart-divider" style="width: 100%; margin: 10px 0;"></div>

                    <!-- Envio do Comprovante -->
                    <p style="font-size: 13px; color: var(--text-muted); text-align: left;">
                        <strong style="color: var(--text-main);">IMPORTANTE:</strong> Após realizar a transferência, clique no botão abaixo para nos enviar o comprovante via WhatsApp. Seus números serão marcados como confirmados assim que recebermos o comprovante.
                    </p>

                    <button type="button" class="btn-whatsapp-confirm" onclick="app.sendReceiptOnWhatsApp()">
                        <i class="fa-brands fa-whatsapp"></i> Enviar Comprovante por WhatsApp
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- ==========================================
         RODAPE
         ========================================== -->
    <footer>
        <div class="container">
            <p>&copy; 2026 RacingRifas. Todos os direitos reservados.</p>
            <p style="font-size: 12px; margin-top: 6px; opacity: 0.6;">Redesign especial - Branco & Azul Celeste. Velocidade e Confiabilidade.</p>
        </div>
    </footer>

    <!-- 4. Modal de Sucesso (Configurações Salvas) -->
    <div class="modal-overlay" id="modalConfigSaved">
        <div class="modal-card" style="max-width: 400px; text-align: center; padding: 32px;">
            <div style="font-size: 56px; color: var(--success); margin-bottom: 16px;">
                <i class="fa-solid fa-circle-check"></i>
            </div>
            <h3 style="font-size: 24px; font-weight: 800; color: var(--primary-dark); margin-bottom: 12px;">Salvo!</h3>
            <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 24px;">
                As configurações da sua rifa foram atualizadas com sucesso no sistema.
            </p>
            <button type="button" class="checkout-btn" onclick="app.closeConfigSavedModalAndHome()">
                <i class="fa-solid fa-house"></i> Voltar para Home Screen
            </button>
        </div>
    </div>

    <!-- Scripts Javascript -->
    ` }}
        />
    );
}
