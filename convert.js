const fs = require('fs');

const html = fs.readFileSync('c:\\rifa\\index.html', 'utf8');
const appJs = fs.readFileSync('c:\\rifa\\app.js', 'utf8');
const pixJs = fs.readFileSync('c:\\rifa\\pix.js', 'utf8');

// Extract everything inside <body>...</body> except the scripts at the bottom
const bodyMatch = html.match(/<body>([\s\S]*?)<script/);
let bodyContent = bodyMatch ? bodyMatch[1] : html;

// Prepare the React Component
const componentCode = `
"use client";
import React, { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export default function RifaApp() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.rifaInitialized) return;
        window.rifaInitialized = true;

        // PIX JS
        ${pixJs}

        // APP JS
        ${appJs.replace(/localStorage\.getItem\([^)]+\)/g, 'null')
               .replace(/localStorage\.setItem\([^)]+\)/g, 'null')}

        // Firebase Integrations
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
                else {
                    state.numbers = [];
                }

                const snapSales = await getDoc(doc(db, 'rifa', 'sales'));
                if(snapSales.exists()) state.sales = snapSales.data().data;
                else state.sales = [];

                if (state.numbers.length === 0) {
                    app.generateNumbers();
                    await app.saveState();
                }

                // Setup realtime listeners
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
            if (newPass) {
                state.settings.adminPassword = newPass;
            }

            try {
                await setDoc(doc(db, 'rifa', 'settings'), state.settings);
                app.renderPublicUI();
                app.openModal('modalConfigSaved');
            } catch (e) {
                console.error("Firebase save settings error", e);
                alert("Erro ao salvar no banco de dados.");
            }
        };

        window.PixGenerator = PixGenerator;
        window.app = app;
        
        // Wait a small tick to let dangerouslySetInnerHTML mount elements
        setTimeout(() => {
            app.init();
        }, 100);

    }, []);

    return (
        <div 
            ref={containerRef}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: \`${bodyContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }}
        />
    );
}
`;

if (!fs.existsSync('c:\\rifa-next\\src\\components')){
    fs.mkdirSync('c:\\rifa-next\\src\\components', { recursive: true });
}
fs.writeFileSync('c:\\rifa-next\\src\\components\\RifaApp.tsx', componentCode);
console.log("RifaApp generated successfully!");
