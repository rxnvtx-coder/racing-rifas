// @ts-nocheck
"use client";
import React, { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// ==========================================
// PIX JS (Top Level)
// ==========================================
/**
 * Utilitário para geração de PIX Estático (padrão EMV BR Code)
 * Desenvolvido por Antigravity para Rifa Digital Premium
 */
class PixGenerator {
    /**
     * Calcula o CRC16 CCITT
     * @param {string} data 
     * @returns {string} CRC16 em formato hexadecimal de 4 dígitos em maiúsculas
     */
    static calculateCRC16(data) {
        let crc = 0xFFFF;
        const polynomial = 0x1021;

        for (let i = 0; i < data.length; i++) {
            const b = data.charCodeAt(i);
            for (let j = 0; j < 8; j++) {
                const bit = ((b >> (7 - j)) & 1) === 1;
                const c15 = ((crc >> 15) & 1) === 1;
                crc <<= 1;
                if (c15 ^ bit) {
                    crc ^= polynomial;
                }
            }
        }

        crc &= 0xFFFF;
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }

    /**
     * Formata um campo no formato EMV [ID][Tamanho][Valor]
     * @param {string} id 
     * @param {string} value 
     * @returns {string}
     */
    static formatField(id, value) {
        const len = value.length.toString().padStart(2, '0');
        return `${id}${len}${value}`;
    }

    /**
     * Remove acentos e caracteres especiais para compatibilidade com o padrão Pix
     * @param {string} str 
     * @returns {string}
     */
    static cleanString(str) {
        return str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/[^a-zA-Z0-9\s@\.\-\+]/g, "") // Mantém apenas alfanuméricos, espaços e caracteres comuns de chaves
            .trim();
    }

    /**
     * Gera a string completa do Pix Copia e Cola
     * @param {Object} params
     * @param {string} params.key Chave Pix (CPF, CNPJ, E-mail, Telefone ou Chave Aleatória)
     * @param {string} params.merchantName Nome do beneficiário (máx 25 chars)
     * @param {string} params.merchantCity Cidade do beneficiário (máx 15 chars)
     * @param {number} params.amount Valor da transação
     * @param {string} [params.description] Descrição opcional (máx 25 chars)
     * @param {string} [params.txid] Identificador da transação (máx 25 chars, padrão: ***)
     * @returns {string} String do Pix Copia e Cola pronta para uso
     */
    static generate({ key, merchantName, merchantCity, amount, description = '', txid = '***' }) {
        // Validação e limpeza de parâmetros
        const cleanKey = key.trim();
        const cleanName = this.cleanString(merchantName).substring(0, 25);
        const cleanCity = this.cleanString(merchantCity).substring(0, 15);
        const cleanDesc = description ? this.cleanString(description).substring(0, 25) : '';
        const cleanTxid = this.cleanString(txid).substring(0, 25);

        // ID 00: Payload Format Indicator (Fixo: 01)
        let payload = this.formatField('00', '01');

        // ID 26: Merchant Account Information
        // Subcampo 00: GUID (Fixo: br.gov.bcb.pix)
        const sub00 = this.formatField('00', 'br.gov.bcb.pix');
        // Subcampo 01: Chave Pix
        const sub01 = this.formatField('01', cleanKey);
        // Subcampo 02: Descrição da transação (Opcional)
        const sub02 = cleanDesc ? this.formatField('02', cleanDesc) : '';
        
        const merchantAccountInfoValue = `${sub00}${sub01}${sub02}`;
        payload += this.formatField('26', merchantAccountInfoValue);

        // ID 52: Merchant Category Code (Fixo: 0000)
        payload += this.formatField('52', '0000');

        // ID 53: Transaction Currency (Fixo: 986 - Real Brasileiro)
        payload += this.formatField('53', '986');

        // ID 54: Transaction Amount (Opcional no estático, mas obrigatório para nós definirmos o valor exato da rifa)
        if (amount > 0) {
            const formattedAmount = amount.toFixed(2);
            payload += this.formatField('54', formattedAmount);
        }

        // ID 58: Country Code (Fixo: BR)
        payload += this.formatField('58', 'BR');

        // ID 59: Merchant Name
        payload += this.formatField('59', cleanName || 'Rifa Digital');

        // ID 60: Merchant City
        payload += this.formatField('60', cleanCity || 'Brasil');

        // ID 62: Additional Data Field Template
        // Subcampo 05: TxID
        const sub05 = this.formatField('05', cleanTxid || '***');
        payload += this.formatField('62', sub05);

        // ID 63: CRC16 (Calculado a partir de toda a string + ID63 + Tamanho 04)
        const partialPayload = payload + '6304';
        const crc = this.calculateCRC16(partialPayload);

        return partialPayload + crc;
    }
}


// ==========================================
// APP JS (Top Level)
// ==========================================
/**
 * Lógica Central do RacingRifas (Design Argentina/Racing)
 * Desenvolvido por Antigravity.
 * Implementa a reatividade do Canvas Hero (ondas interativas + bandeira tremulando)
 * com otimização mobile, controle de localStorage e painel administrativo.
 */

// Estado Global da Aplicação
const state = {
    settings: {},
    numbers: [],
    sales: [],
    selectedNumbers: [],
    currentAdminTab: 'sales',
    checkoutTimerInterval: null,
    activeCheckoutSaleId: null,
    currentFilter: 'all',
    
    // Estado do Canvas
    canvas: {
        instance: null,
        ctx: null,
        animationId: null,
        time: 0,
        mouse: { x: 0, y: 0 },
        targetMouse: { x: 0, y: 0 }
    }
};

// Configurações e Números Padrão (Tema RacingRifas)
const DEFAULTS = {
    settings: {
        title: "Ajude o Racing!",
        description: "Faça parte da História do Racing Club de Curitiba, e ajude o clube a participar da Conference Cup! 3 prêmios, 3 chances de ganhar, e em campo lutaremos por essas cores e por você, torcedor!",
        ticketPrice: 30.00,
        pixKey: "12d4dd34-59df-4f30-b45b-992fb78a244b",
        pixName: "Racing Club de Curitiba",
        pixCity: "Curitiba",
        whatsappSupport: "5511999999999",
        adminPassword: "admin",
        prize1_title: "1º Prêmio - Capacete Réplica Ayrton Senna",
        prize1_desc: "Réplica perfeita em tamanho real do capacete lendário do tricampeão, com caixa expositora de acrílico premium.",
        prize2_title: "2º Prêmio - Volante Logitech G923",
        prize2_desc: "Volante de simulação de corrida de última geração com Force Feedback verdadeiro, pedais e câmbio para PC/Console.",
        prize3_title: "3º Prêmio - R$ 1.000,00 no Pix",
        prize3_desc: "Transferência bancária Pix imediata direto para o bolso do ganhador, para comemorar em grande estilo."
    }
};

// ==========================================
// INICIALIZAÇÃO DO APLICATIVO (ROBUSTA E COMPATÍVEL COM QUALQUER TEMPORIZAÇÃO)
// ==========================================
if (document.readyState === "complete" || document.readyState === "interactive") {
    app.init();
} else {
    document.addEventListener("DOMContentLoaded", () => {
        app.init();
    });
}

const app = {
    init: function() {
        this.loadLocalStorage();
        this.checkExpiredReservations();
        this.renderPublicUI();
        this.renderNumbersGrid();
        this.setupEventListeners();
        this.initCanvasHero();
        
        // Intervalo periódico para expirar reservas a cada 30 segundos
        setInterval(() => this.checkExpiredReservations(), 30000);
    },

    // Carrega dados do localStorage ou inicia com padrões
    loadLocalStorage: function() {
        // 1. Configurações
        const savedSettings = null;
        if (savedSettings) {
            state.settings = JSON.parse(savedSettings);
            
            // Força a migração do título anterior para o novo padrão do Racing Club de Curitiba
            if (state.settings.title === "Super Rifa Digital de Prêmios" || state.settings.title === "RacingRifas - Sorteio de Velocidade" || state.settings.title === "RacingRifas" || !state.settings.title) {
                state.settings = { ...DEFAULTS.settings };
                null;
            } else {
                // Garante retrocompatibilidade se faltar alguma chave nova
                for (let key in DEFAULTS.settings) {
                    if (state.settings[key] === undefined) {
                        state.settings[key] = DEFAULTS.settings[key];
                    }
                }
                
                // Patch: Atualizar a descrição antiga para a nova versão (com "lutaremos")
                if (state.settings.description && state.settings.description.includes("buscaremos lutar")) {
                    state.settings.description = DEFAULTS.settings.description;
                    null;
                }
            }
        } else {
            state.settings = { ...DEFAULTS.settings };
            null;
        }

        // 2. Números da Rifa (Lista de 1 a 100)
        const savedNumbers = null;
        if (savedNumbers) {
            state.numbers = JSON.parse(savedNumbers);
        } else {
            this.generateInitialNumbers();
        }

        // 3. Vendas e Compras
        const savedSales = null;
        if (savedSales) {
            state.sales = JSON.parse(savedSales);
        } else {
            state.sales = [];
            null;
        }
    },

    // Gera a lista de 100 números
    generateInitialNumbers: function() {
        state.numbers = [];
        for (let i = 1; i <= 100; i++) {
            const numStr = i.toString().padStart(2, '0');
            state.numbers.push({
                id: numStr,
                status: 'available',
                buyerName: '',
                buyerPhone: '',
                reservedAt: null,
                saleId: null
            });
        }
        null;
    },

    // Configura máscaras de inputs e comportamentos reativos
    setupEventListeners: function() {
        // Máscara para o WhatsApp do comprador
        const phoneInput = document.getElementById("buyerPhone");
        if (phoneInput) {
            phoneInput.addEventListener("input", (e) => this.formatPhoneNumber(e));
        }

        // Máscara para o WhatsApp de consulta
        const consultPhoneInput = document.getElementById("consultPhone");
        if (consultPhoneInput) {
            consultPhoneInput.addEventListener("input", (e) => this.formatPhoneNumber(e));
        }
    },

    formatPhoneNumber: function(e) {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    },

    // Verifica e expira reservas que passaram do tempo limite (15 min)
    checkExpiredReservations: function() {
        const now = Date.now();
        const expirationTime = 15 * 60 * 1000;
        let dataChanged = false;

        state.sales.forEach(sale => {
            if (sale.status === 'reserved' && (now - sale.createdAt) > expirationTime) {
                sale.status = 'expired';
                
                state.numbers.forEach(num => {
                    if (num.saleId === sale.id && num.status === 'reserved') {
                        num.status = 'available';
                        num.buyerName = '';
                        num.buyerPhone = '';
                        num.reservedAt = null;
                        num.saleId = null;
                    }
                });
                
                dataChanged = true;
            }
        });

        if (dataChanged) {
            this.saveData();
            this.renderNumbersGrid();
            this.renderProgress();
            if (document.getElementById("adminPanel").style.display === "block") {
                this.renderAdminPanel();
            }
        }
    },

    // Salva o estado atual no localStorage
    saveData: function() {
        null;
        null;
    },

    // ==========================================
    // RENDERIZAÇÃO DA INTERFACE PÚBLICA
    // ==========================================
    renderPublicUI: function() {
        // Título e Descrição da Rifa
        document.getElementById("rifaTitle").innerHTML = state.settings.title.replace("RacingRifas", "<span>RacingRifas</span>");
        document.getElementById("rifaDesc").innerText = state.settings.description;
        
        // Exibição do Preço da Cota
        const priceFormatted = parseFloat(state.settings.ticketPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const cotaDisplay = document.getElementById("cotaPriceDisplay");
        if (cotaDisplay) cotaDisplay.innerText = priceFormatted;
        const cartUnit = document.getElementById("cartUnitPrice");
        if (cartUnit) cartUnit.innerText = priceFormatted;

        // Títulos e Descrições dos Prêmios na Barra Superior do Hero
        document.getElementById("prizeTitle1").innerText = state.settings.prize1_title;
        document.getElementById("prizeDesc1").innerText = state.settings.prize1_desc;
        document.getElementById("prizeTitle2").innerText = state.settings.prize2_title;
        document.getElementById("prizeDesc2").innerText = state.settings.prize2_desc;
        document.getElementById("prizeTitle3").innerText = state.settings.prize3_title;
        document.getElementById("prizeDesc3").innerText = state.settings.prize3_desc;

        this.renderProgress();
    },

    // Renderiza a barra de progresso de vendas
    renderProgress: function() {
        const total = state.numbers.length;
        const soldCount = state.numbers.filter(n => n.status === 'paid').length;
        const reservedCount = state.numbers.filter(n => n.status === 'reserved').length;
        const filledPercent = Math.round(((soldCount + reservedCount) / total) * 100);

        document.getElementById("progressPercent").innerText = `${filledPercent}%`;
        document.getElementById("soldCountDisplay").innerText = `${soldCount} Confirmados / ${reservedCount} Reservados (Total: ${total})`;
        document.getElementById("progressBarFill").style.width = `${filledPercent}%`;
    },

    // Renderiza o grid de 100 números de acordo com o filtro ativo e pesquisa
    renderNumbersGrid: function() {
        const gridContainer = document.getElementById("numbersGrid");
        gridContainer.innerHTML = "";
        
        const searchInput = document.getElementById("searchNumber");
        const searchQuery = searchInput ? searchInput.value.trim() : "";

        state.numbers.forEach(num => {
            if (state.currentFilter === 'available' && num.status !== 'available') return;
            if (state.currentFilter === 'reserved' && num.status !== 'reserved') return;
            if (state.currentFilter === 'paid' && num.status !== 'paid') return;

            if (searchQuery && !num.id.includes(searchQuery)) return;

            const cell = document.createElement("div");
            cell.className = `number-cell ${num.status}`;
            
            if (state.selectedNumbers.includes(num.id)) {
                cell.className = "number-cell selected";
            }
            
            cell.innerText = num.id;
            
            if (num.status === 'available') {
                cell.addEventListener("click", () => this.toggleNumberSelection(num.id));
            } else {
                cell.title = `${num.status === 'paid' ? 'Pago por' : 'Reservado para'}: ${num.buyerName}`;
            }

            gridContainer.appendChild(cell);
        });

        if (gridContainer.children.length === 0) {
            gridContainer.innerHTML = `<p style="grid-column: span 10; text-align: center; color: var(--text-muted); padding: 30px 0;">Nenhum número correspondente encontrado.</p>`;
        }
    },

    // ==========================================
    // SELEÇÃO E CARRINHO
    // ==========================================
    toggleNumberSelection: function(numId) {
        const index = state.selectedNumbers.indexOf(numId);
        if (index > -1) {
            state.selectedNumbers.splice(index, 1);
        } else {
            state.selectedNumbers.push(numId);
        }
        
        state.selectedNumbers.sort((a, b) => parseInt(a) - parseInt(b));

        this.renderCart();
        this.renderNumbersGrid();
    },

    renderCart: function() {
        const cartEmpty = document.getElementById("cartEmpty");
        const cartContent = document.getElementById("cartContent");
        const cartSelectedNumbers = document.getElementById("cartSelectedNumbers");
        const cartCount = document.getElementById("cartCount");
        const cartTotalPrice = document.getElementById("cartTotalPrice");

        if (state.selectedNumbers.length === 0) {
            cartEmpty.style.display = "block";
            cartContent.style.display = "none";
            return;
        }

        cartEmpty.style.display = "none";
        cartContent.style.display = "block";

        cartSelectedNumbers.innerHTML = "";
        state.selectedNumbers.forEach(num => {
            const badge = document.createElement("div");
            badge.className = "cart-number-badge";
            badge.innerHTML = `${num} <i class="fa-solid fa-xmark" onclick="app.toggleNumberSelection('${num}')"></i>`;
            cartSelectedNumbers.appendChild(badge);
        });

        const count = state.selectedNumbers.length;
        cartCount.innerText = `${count} ${count === 1 ? 'cota' : 'cotas'}`;
        
        const total = count * parseFloat(state.settings.ticketPrice);
        cartTotalPrice.innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    filterNumbers: function(filterType) {
        state.currentFilter = filterType;
        
        const buttons = ['all', 'available', 'reserved', 'paid'];
        buttons.forEach(b => {
            const btn = document.getElementById(`filterBtn${b.charAt(0).toUpperCase() + b.slice(1)}`);
            if (btn) {
                if (b === filterType) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            }
        });

        this.renderNumbersGrid();
    },

    searchNumber: function() {
        this.renderNumbersGrid();
    },

    // ==========================================
    // INICIALIZAÇÃO E ANIMAÇÃO DO CANVAS HERO (GLOWY WAVES HERO)
    // ==========================================
    initCanvasHero: function() {
        const canvas = document.getElementById("siteCanvasBackground");
        if (!canvas) return;

        state.canvas.instance = canvas;
        state.canvas.ctx = canvas.getContext("2d");

        const ctx = state.canvas.ctx;
        let animationId;
        
        // Define as cores com base no tema claro (Argentina/Racing)
        const themeColors = {
            backgroundTop: "#ffffff",
            backgroundBottom: "#f4f8fc", // Cinza azulado muito suave
            flagSkyBlue: "rgba(116, 172, 223, 0.20)", // Azul celeste suave translúcido
            flagWhite: "rgba(255, 255, 255, 0.35)", // Branco translúcido
            wavePalette: [
                {
                    offset: 0,
                    amplitude: 50,
                    frequency: 0.003,
                    color: "rgba(116, 172, 223, 0.55)", // Azul celeste brilhante
                    opacity: 0.5,
                },
                {
                    offset: Math.PI / 2,
                    amplitude: 70,
                    frequency: 0.0025,
                    color: "rgba(14, 165, 233, 0.45)", // Celeste secundário
                    opacity: 0.4,
                },
                {
                    offset: Math.PI,
                    amplitude: 45,
                    frequency: 0.0035,
                    color: "rgba(255, 255, 255, 0.8)", // Branco
                    opacity: 0.5,
                },
                {
                    offset: Math.PI * 1.5,
                    amplitude: 60,
                    frequency: 0.002,
                    color: "rgba(234, 179, 8, 0.35)", // Dourado do sol argentino
                    opacity: 0.35,
                },
                {
                    offset: Math.PI * 2,
                    amplitude: 40,
                    frequency: 0.004,
                    color: "rgba(58, 130, 196, 0.25)", // Azul mais escuro/profundo
                    opacity: 0.25,
                }
            ]
        };

        const isMobile = window.innerWidth < 768;
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // Parâmetros de reatividade e performance
        const mouseInfluence = prefersReducedMotion ? 5 : (isMobile ? 25 : 55);
        const influenceRadius = prefersReducedMotion ? 80 : (isMobile ? 150 : 260);
        const smoothing = prefersReducedMotion ? 0.02 : 0.07;
        const stepSize = isMobile ? 8 : 4; // Passo maior em mobile (ganho gigante de performance)

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const recenterMouse = () => {
            const centerPoint = { x: canvas.width / 2, y: canvas.height / 2 };
            state.canvas.mouse = { ...centerPoint };
            state.canvas.targetMouse = { ...centerPoint };
        };

        resizeCanvas();
        recenterMouse();

        // Eventos
        window.addEventListener("resize", () => {
            resizeCanvas();
            recenterMouse();
        });

        // Evento mouse
        window.addEventListener("mousemove", (event) => {
            state.canvas.targetMouse = {
                x: event.clientX,
                y: event.clientY
            };
        });

        window.addEventListener("mouseleave", () => {
            recenterMouse();
        });

        // Evento toque mobile
        window.addEventListener("touchmove", (event) => {
            if (event.touches.length > 0) {
                state.canvas.targetMouse = {
                    x: event.touches[0].clientX,
                    y: event.touches[0].clientY
                };
            }
        }, { passive: true });

        window.addEventListener("touchend", () => {
            recenterMouse();
        });

        // Função para desenhar a bandeira de listras verticais
        const drawFlagBackground = () => {
            const width = canvas.width;
            const height = canvas.height;

            // Fundo Azul Vivo Sólido (sem opacidade)
            ctx.fillStyle = "#0088cc";
            ctx.fillRect(0, 0, width, height);

            // 3 Listras Brancas Verticais Sólidas (sem opacidade)
            ctx.fillStyle = "#ffffff";
            
            const numStripes = 7; // Distribui em 7 colunas (4 azuis, 3 brancas)
            const stripeWidth = width / numStripes;

            // Ondulação vertical (eixo Y)
            const getRipple = (y) => {
                return Math.sin(y * 0.005 + state.canvas.time * 0.04) * 20;
            };

            // Desenhando as 3 listras brancas (índices 1, 3 e 5)
            [1, 3, 5].forEach(i => {
                const baseX = i * stripeWidth;
                ctx.beginPath();
                
                // Lado esquerdo da listra
                ctx.moveTo(baseX + getRipple(0), 0);
                for (let y = 0; y <= height; y += 20) {
                    ctx.lineTo(baseX + getRipple(y), y);
                }
                
                // Lado direito da listra
                ctx.lineTo(baseX + stripeWidth + getRipple(height), height);
                for (let y = height; y >= 0; y -= 20) {
                    ctx.lineTo(baseX + stripeWidth + getRipple(y), y);
                }
                
                ctx.closePath();
                ctx.fill();
            });
        };

        // Loop de Animação
        const animate = () => {
            state.canvas.time += 1;

            // Atualiza o background vertical
            drawFlagBackground();

            state.canvas.animationId = window.requestAnimationFrame(animate);
        };


        state.canvas.animationId = window.requestAnimationFrame(animate);
    },

    // ==========================================
    // CONSULTA DE COTAS POR TELEFONE
    // ==========================================
    consultTickets: function(event) {
        event.preventDefault();
        
        const phoneInput = document.getElementById("consultPhone").value.trim();
        const resultBox = document.getElementById("consultResultBox");
        const userTitle = document.getElementById("consultUserTitle");
        const listContainer = document.getElementById("consultTicketsList");

        if (!phoneInput) return;

        // Limpa telefone para comparar somente os dígitos
        const cleanSearchPhone = phoneInput.replace(/\D/g, '');

        if (cleanSearchPhone.length < 10) {
            alert("Por favor, digite o número de telefone com o DDD correto.");
            return;
        }

        // Filtra todas as vendas que contêm o telefone correspondente
        const matchedSales = state.sales.filter(sale => {
            const cleanSalePhone = sale.buyerPhone.replace(/\D/g, '');
            return cleanSalePhone === cleanSearchPhone && sale.status !== 'expired';
        });

        // Mostra a box de resultado
        resultBox.style.display = "block";
        listContainer.innerHTML = "";

        if (matchedSales.length === 0) {
            userTitle.innerHTML = `<span style="color: var(--danger);"><i class="fa-solid fa-circle-xmark"></i> Nenhuma cota ativa encontrada para este telefone.</span>`;
            return;
        }

        // Se encontrou, pega o nome do comprador da primeira venda encontrada
        const buyerName = matchedSales[0].buyerName;
        userTitle.innerHTML = `<span style="color: var(--success);"><i class="fa-solid fa-circle-check"></i> Olá, <strong>${buyerName}</strong>! Encontramos as seguintes cotas:</span>`;

        // Junta e renderiza todos os números vinculados
        matchedSales.forEach(sale => {
            sale.numbers.forEach(num => {
                const badge = document.createElement("span");
                
                // Define a classe de estilo com base no status real do número
                const realNumObj = state.numbers.find(n => n.id === num);
                const statusClass = realNumObj ? realNumObj.status : sale.status;
                const statusText = statusClass === 'paid' ? 'Confirmado' : 'Reservado';
                
                badge.className = `status-badge ${statusClass}`;
                badge.style.display = "inline-flex";
                badge.style.margin = "4px";
                badge.style.fontSize = "13px";
                badge.style.padding = "6px 12px";
                badge.style.fontWeight = "800";
                badge.innerText = `${num} (${statusText})`;
                
                listContainer.appendChild(badge);
            });
        });
    },

    // ==========================================
    // FLUXO DE COMPRA E PIX
    // ==========================================
    processCheckout: function(event) {
        event.preventDefault();
        
        const buyerName = document.getElementById("buyerName").value.trim();
        const buyerPhone = document.getElementById("buyerPhone").value.trim();

        if (!buyerName || !buyerPhone || state.selectedNumbers.length === 0) {
            alert("Por favor, preencha todos os dados corretamente.");
            return;
        }

        const totalValue = state.selectedNumbers.length * parseFloat(state.settings.ticketPrice);
        const saleId = 'sale_' + Date.now();
        const now = Date.now();

        const newSale = {
            id: saleId,
            buyerName: buyerName,
            buyerPhone: buyerPhone,
            numbers: [...state.selectedNumbers],
            totalValue: totalValue,
            status: 'reserved',
            createdAt: now
        };

        state.sales.push(newSale);

        state.numbers.forEach(num => {
            if (state.selectedNumbers.includes(num.id)) {
                num.status = 'reserved';
                num.buyerName = buyerName;
                num.buyerPhone = buyerPhone;
                num.reservedAt = now;
                num.saleId = saleId;
            }
        });

        this.saveData();

        state.activeCheckoutSaleId = saleId;
        this.setupPixModal(newSale);

        state.selectedNumbers = [];
        document.getElementById("buyerName").value = "";
        document.getElementById("buyerPhone").value = "";
        
        this.renderCart();
        this.renderNumbersGrid();
        this.renderProgress();

        this.openModal('modalCheckoutPix');
    },

    setupPixModal: function(sale) {
        if (state.checkoutTimerInterval) {
            clearInterval(state.checkoutTimerInterval);
        }

        const pixPayload = PixGenerator.generate({
            key: state.settings.pixKey,
            merchantName: state.settings.pixName,
            merchantCity: state.settings.pixCity,
            amount: sale.totalValue,
            description: `Rifa Racing: ${sale.numbers.join(',')}`,
            txid: sale.id.substring(5, 30)
        });

        document.getElementById("pixCopiaCola").value = pixPayload;

        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixPayload)}`;
        document.getElementById("pixQrCodeImg").src = qrCodeUrl;

        const btnCopy = document.getElementById("btnCopyPixText");
        btnCopy.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar';
        btnCopy.style.background = 'var(--primary-dark)';

        const secondsLimit = 15 * 60;
        let elapsed = 0;
        
        const updateTimerDisplay = () => {
            const remaining = secondsLimit - elapsed;
            if (remaining <= 0) {
                clearInterval(state.checkoutTimerInterval);
                document.getElementById("pixTimer").innerText = "EXPIRADO";
                alert("Tempo limite de reserva excedido! Seus números foram liberados para outros compradores.");
                this.closeModal('modalCheckoutPix');
                this.checkExpiredReservations();
                return;
            }

            const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
            const seconds = (remaining % 60).toString().padStart(2, '0');
            document.getElementById("pixTimer").innerText = `${minutes}:${seconds}`;
            elapsed++;
        };

        updateTimerDisplay();
        state.checkoutTimerInterval = setInterval(updateTimerDisplay, 1000);
    },

    copyPixCode: function() {
        const copyText = document.getElementById("pixCopiaCola");
        copyText.select();
        copyText.setSelectionRange(0, 99999);

        navigator.clipboard.writeText(copyText.value).then(() => {
            const btnCopy = document.getElementById("btnCopyPixText");
            btnCopy.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
            btnCopy.style.background = 'var(--success)';
            setTimeout(() => {
                btnCopy.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar';
                btnCopy.style.background = 'var(--primary-dark)';
            }, 2000);
        }).catch(err => {
            console.error("Falha ao copiar texto: ", err);
        });
    },

    sendReceiptOnWhatsApp: function() {
        const sale = state.sales.find(s => s.id === state.activeCheckoutSaleId);
        if (!sale) return;

        const adminPhone = state.settings.whatsappSupport.replace(/\D/g, '');
        const formattedTotal = sale.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        const message = `Olá! Realizei o Pix de ${formattedTotal} para a Rifa RacingRifas.\n\n` +
                        `👤 *Nome:* ${sale.buyerName}\n` +
                        `📞 *Contato:* ${sale.buyerPhone}\n` +
                        `🏎️ *Cotas Reservadas:* ${sale.numbers.join(', ')}\n\n` +
                        `Estou enviando o comprovante em anexo para confirmar a minha participação. Aguardo a aprovação!`;

        const waUrl = `https://api.whatsapp.com/send?phone=${adminPhone}&text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    },

    // ==========================================
    // ACESSO AO PAINEL ADMINISTRATIVO
    // ==========================================
    openAdminLoginModal: function() {
        const panel = document.getElementById("adminPanel");
        if (panel.style.display === "block") {
            panel.scrollIntoView({ behavior: 'smooth' });
            return;
        }
        
        document.getElementById("adminPassword").value = "";
        this.openModal('modalAdminLogin');
    },

    loginAdmin: function(event) {
        event.preventDefault();
        const pwd = document.getElementById("adminPassword").value;

        if (pwd === state.settings.adminPassword) {
            app.closeModal('modalAdminLogin');
            document.getElementById("adminPanel").style.display = "block";
            document.getElementById("btnAdminTrigger").style.display = "none";
            
            app.populateSettingsForm();
            app.renderAdminPanel();
            
            setTimeout(() => {
                document.getElementById("adminPanel").scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } else {
            alert("Senha incorreta! Tente novamente.");
        }
    },

    logoutAdmin: function() {
        document.getElementById("adminPanel").style.display = "none";
        document.getElementById("btnAdminTrigger").style.display = "flex";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    renderAdminPanel: function() {
        const totalPaid = state.sales
            .filter(s => s.status === 'paid')
            .reduce((sum, s) => sum + s.totalValue, 0);
            
        const totalPending = state.sales
            .filter(s => s.status === 'reserved')
            .reduce((sum, s) => sum + s.totalValue, 0);

        const paidTicketsCount = state.numbers.filter(n => n.status === 'paid').length;
        const totalTickets = state.numbers.length;
        const occupancyRate = Math.round((paidTicketsCount / totalTickets) * 100);

        document.getElementById("metricRevenue").innerText = totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById("metricPending").innerText = totalPending.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById("metricSold").innerText = `${paidTicketsCount} / ${totalTickets}`;
        document.getElementById("metricPercent").innerText = `${occupancyRate}%`;

        const tbody = document.getElementById("salesTableBody");
        tbody.innerHTML = "";

        const sortedSales = [...state.sales].reverse();

        sortedSales.forEach(sale => {
            if (sale.status === 'expired') return;

            const tr = document.createElement("tr");
            
            const tdName = document.createElement("td");
            tdName.innerHTML = `<strong>${sale.buyerName}</strong>`;
            tr.appendChild(tdName);

            const tdPhone = document.createElement("td");
            tdPhone.innerText = sale.buyerPhone;
            tr.appendChild(tdPhone);

            const tdNumbers = document.createElement("td");
            tdNumbers.innerHTML = sale.numbers.map(num => `<span class="cart-number-badge" style="display:inline-flex; margin-right:4px;">${num}</span>`).join('');
            tr.appendChild(tdNumbers);

            const tdValue = document.createElement("td");
            tdValue.innerText = sale.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            tr.appendChild(tdValue);

            const tdStatus = document.createElement("td");
            const statusLabel = sale.status === 'paid' ? 'Pago' : 'Reservado';
            tdStatus.innerHTML = `<span class="status-badge ${sale.status}">${statusLabel}</span>`;
            tr.appendChild(tdStatus);

            const tdActions = document.createElement("td");
            tdActions.className = "admin-actions";

            if (sale.status === 'reserved') {
                const btnApprove = document.createElement("button");
                btnApprove.className = "action-btn approve";
                btnApprove.title = "Confirmar Pagamento";
                btnApprove.innerHTML = `<i class="fa-solid fa-check"></i>`;
                btnApprove.addEventListener("click", () => this.approveSale(sale.id));
                tdActions.appendChild(btnApprove);
            }

            const btnRelease = document.createElement("button");
            btnRelease.className = "action-btn release";
            btnRelease.title = "Liberar Cotas (Excluir Reserva)";
            btnRelease.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
            btnRelease.addEventListener("click", () => this.releaseSale(sale.id));
            tdActions.appendChild(btnRelease);

            tr.appendChild(tdActions);
            tbody.appendChild(tr);
        });

        if (tbody.children.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhuma reserva ativa cadastrada.</td></tr>`;
        }
    },

    switchAdminTab: function(tabName) {
        state.currentAdminTab = tabName;
        
        const tabBtnSales = document.getElementById("tabBtnSales");
        const tabBtnSettings = document.getElementById("tabBtnSettings");
        const tabContentSales = document.getElementById("tabContentSales");
        const tabContentSettings = document.getElementById("tabContentSettings");

        if (tabName === 'sales') {
            tabBtnSales.classList.add("active");
            tabBtnSettings.classList.remove("active");
            tabContentSales.classList.add("active");
            tabContentSettings.classList.remove("active");
            this.renderAdminPanel();
        } else {
            tabBtnSales.classList.remove("active");
            tabBtnSettings.classList.add("active");
            tabContentSales.classList.remove("active");
            tabContentSettings.classList.add("active");
        }
    },

    populateSettingsForm: function() {
        document.getElementById("setRifaTitle").value = state.settings.title;
        document.getElementById("setRifaDesc").value = state.settings.description;
        document.getElementById("setPixKey").value = state.settings.pixKey;
        document.getElementById("setPixName").value = state.settings.pixName;
        document.getElementById("setPixCity").value = state.settings.pixCity;
        document.getElementById("setTicketPrice").value = state.settings.ticketPrice;
        document.getElementById("setPrizeTitle1").value = state.settings.prize1_title;
        document.getElementById("setPrizeDesc1").value = state.settings.prize1_desc;
        document.getElementById("setPrizeTitle2").value = state.settings.prize2_title;
        document.getElementById("setPrizeDesc2").value = state.settings.prize2_desc;
        document.getElementById("setPrizeTitle3").value = state.settings.prize3_title;
        document.getElementById("setPrizeDesc3").value = state.settings.prize3_desc;
        
        // WhatsApp Organizador
        if (!state.settings.whatsappSupport) {
            state.settings.whatsappSupport = "5511999999999";
        }
        
        let waGroup = document.getElementById("setWhatsappGroup");
        if (!waGroup) {
            const ticketPriceInput = document.getElementById("setTicketPrice").parentNode;
            waGroup = document.createElement("div");
            waGroup.className = "form-group";
            waGroup.id = "setWhatsappGroup";
            waGroup.innerHTML = `
                <label for="setWhatsappSupport">WhatsApp do Organizador para Suporte (Somente números com DDI, ex: 5511999999999)</label>
                <input type="text" id="setWhatsappSupport" class="form-control" required>
            `;
            ticketPriceInput.parentNode.insertBefore(waGroup, ticketPriceInput.nextSibling);
        }
        document.getElementById("setWhatsappSupport").value = state.settings.whatsappSupport;
    },

    saveSettings: function(event) {
        event.preventDefault();
        
        state.settings.title = document.getElementById("setRifaTitle").value.trim();
        state.settings.description = document.getElementById("setRifaDesc").value.trim();
        state.settings.pixKey = document.getElementById("setPixKey").value.trim();
        state.settings.pixName = document.getElementById("setPixName").value.trim();
        state.settings.pixCity = document.getElementById("setPixCity").value.trim();
        state.settings.ticketPrice = parseFloat(document.getElementById("setTicketPrice").value);
        state.settings.whatsappSupport = document.getElementById("setWhatsappSupport").value.trim();
        
        state.settings.prize1_title = document.getElementById("setPrizeTitle1").value.trim();
        state.settings.prize1_desc = document.getElementById("setPrizeDesc1").value.trim();
        state.settings.prize2_title = document.getElementById("setPrizeTitle2").value.trim();
        state.settings.prize2_desc = document.getElementById("setPrizeDesc2").value.trim();
        state.settings.prize3_title = document.getElementById("setPrizeTitle3").value.trim();
        state.settings.prize3_desc = document.getElementById("setPrizeDesc3").value.trim();

        const newPwd = document.getElementById("setAdminPassword").value;
        if (newPwd) {
            state.settings.adminPassword = newPwd;
            document.getElementById("setAdminPassword").value = "";
        }

        null;

        app.renderPublicUI();
        app.renderNumbersGrid();
        
        // Abre o modal customizado de sucesso em vez do alert
        app.openModal('modalConfigSaved');
    },

    approveSale: function(saleId) {
        const sale = state.sales.find(s => s.id === saleId);
        if (!sale) return;

        if (confirm(`Deseja confirmar o pagamento de ${sale.buyerName} para as cotas: ${sale.numbers.join(', ')}?`)) {
            sale.status = 'paid';

            state.numbers.forEach(num => {
                if (num.saleId === saleId) {
                    num.status = 'paid';
                }
            });

            app.saveData();
            app.renderAdminPanel();
            app.renderNumbersGrid();
            app.renderProgress();
        }
    },

    releaseSale: function(saleId) {
        const sale = state.sales.find(s => s.id === saleId);
        if (!sale) return;

        if (confirm(`Tem certeza que deseja LIBERAR os números ${sale.numbers.join(', ')}? Isto cancelará a venda de ${sale.buyerName} e colocará os números de volta como DISPONÍVEIS.`)) {
            const index = state.sales.indexOf(sale);
            if (index > -1) {
                state.sales.splice(index, 1);
            }

            state.numbers.forEach(num => {
                if (num.saleId === saleId) {
                    num.status = 'available';
                    num.buyerName = '';
                    num.buyerPhone = '';
                    num.reservedAt = null;
                    num.saleId = null;
                }
            });

            app.saveData();
            app.renderAdminPanel();
            app.renderNumbersGrid();
            app.renderProgress();
        }
    },

    resetRifaData: function() {
        if (confirm("🚨 ATENÇÃO! Você está prestes a LIMPAR toda a Rifa! Isso apagará todos os compradores, faturamentos e reservas atuais. Todos os 100 números ficarão disponíveis novamente. Deseja continuar?")) {
            state.sales = [];
            null;
            app.generateInitialNumbers();
            
            app.renderAdminPanel();
            app.renderNumbersGrid();
            app.renderProgress();
            
            alert("Rifa limpa com sucesso!");
        }
    },

    // ==========================================
    // UTILITÁRIOS DE MODAL
    // ==========================================
    openModal: function(modalId) {
        document.getElementById(modalId).classList.add("active");
        
        // Foca no input do telefone ao abrir o modal de consulta
        if (modalId === 'modalConsultTickets') {
            document.getElementById("consultPhone").value = "";
            document.getElementById("consultResultBox").style.display = "none";
            setTimeout(() => {
                document.getElementById("consultPhone").focus();
            }, 150);
        }
    },

    closeModal: function(modalId) {
        document.getElementById(modalId).classList.remove("active");
        
        if (modalId === 'modalCheckoutPix' && state.checkoutTimerInterval) {
            clearInterval(state.checkoutTimerInterval);
        }
    },

    closeConfigSavedModalAndHome: function() {
        app.closeModal('modalConfigSaved');
        app.logoutAdmin();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};


// ==========================================
// FIREBASE OVERRIDES (Top Level)
// ==========================================
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

// ==========================================
// REACT COMPONENT
// ==========================================
export default function RifaApp() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.rifaInitialized) return;
        window.rifaInitialized = true;

        window.PixGenerator = PixGenerator;
        window.app = app;
        
        setTimeout(() => {
            app.init();
        }, 100);
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
