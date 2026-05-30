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
