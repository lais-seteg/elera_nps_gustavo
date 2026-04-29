/**
 * NPS Survey - Integração com Supabase
 * Fluxo: Processando → Agradecimento → Reset total ao fechar
 * Captura do identificador: extraído do texto "Olá, [Nome]" na saudação
 */

(function() {
  'use strict';

  // ================= CONFIGURAÇÃO =================
  const CONFIG = {
    supabaseUrl: 'https://acpugxkikuzbvtjwxups.supabase.co',
    supabaseKey: 'sb_publishable_a0U4Wj3UT55pb6erGH0LDw_qDnujVJe',
    ratingGroupIds: ['rating-q1', 'rating-q2', 'rating-q3', 'rating-q4'],
    urlParamNome: 'nome' // Fallback: pesquisa.html?nome=RAFAELA%20SANTOS
  };

  // Inicializa cliente Supabase
  const supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  const state = {
    isSubmitting: false,
    isSubmitted: false,
    identificador: null
  };

  // Elementos do DOM
  const elements = {
    submitBtn: document.getElementById('submit-btn'),
    processingMsg: document.getElementById('processing-msg'),
    successScreen: document.getElementById('success-screen'),
    closeBtn: document.getElementById('close-success'),
    feedback: document.getElementById('feedback'),
    greetingText: document.getElementById('greeting-text'),
    ratingGroups: document.querySelectorAll('.rating'),
    errorMessages: document.querySelectorAll('.error-msg')
  };

  function init() {
    capturarIdentificadorDaSaudacao();
    setupRatingLogic();
    setupFormSubmission();
    setupCloseSuccess();
  }

  // ============================================
  // FUNÇÃO PRINCIPAL: Captura nome da saudação
  // ============================================
  function capturarIdentificadorDaSaudacao() {
    let nome = null;
    
    // 1º: Tenta extrair do elemento de saudação (ex: "Olá, Rafaella Araújo")
    if (elements.greetingText) {
      const textoSaudacao = elements.greetingText.textContent.trim();
      // Regex: captura tudo após "Olá, " (case-insensitive)
      const match = textoSaudacao.match(/^Olá,\s*(.+)$/i);
      if (match && match[1]) {
        nome = match[1].trim();
      }
    }
    
    // 2º: Fallback - tenta pegar da URL se não encontrou na saudação
    if (!nome) {
      const params = new URLSearchParams(window.location.search);
      const nomeUrl = params.get(CONFIG.urlParamNome);
      if (nomeUrl) {
        nome = decodeURIComponent(nomeUrl).trim();
      }
    }
    
    // 3º: Se ainda não tem nome, usa padrão
    if (!nome) {
      nome = 'RESPONDENTE NÃO IDENTIFICADO';
      console.warn('Nome não encontrado na saudação nem na URL. Usando valor padrão.');
    }
    
    // Normaliza para maiúsculas: "rafaella araújo" → "RAFAELLA ARAÚJO"
    state.identificador = nome.toUpperCase();
    
    // Atualiza a saudação na tela com formatação correta (Title Case)
    if (elements.greetingText) {
      elements.greetingText.textContent = `Olá, ${formatarNomeExibicao(state.identificador)}`;
    }
  }

  // Formata nome para exibição amigável: "RAFAELLA ARAÚJO" → "Rafaella Araújo"
  function formatarNomeExibicao(nome) {
    return nome
      .toLowerCase()
      .split(' ')
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
      .join(' ');
  }

  // Lógica de seleção independente por pergunta
  function setupRatingLogic() {
    elements.ratingGroups.forEach(group => {
      group.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;

        const currentlySelected = group.querySelector('.selected');
        if (currentlySelected) currentlySelected.classList.remove('selected');
        btn.classList.add('selected');
        
        const groupId = group.id.replace('rating-', '');
        const errorEl = document.getElementById(`error-${groupId}`);
        if (errorEl) errorEl.textContent = '';
        
        if ('vibrate' in navigator) navigator.vibrate(10);
      });
    });
  }

  // Validação do formulário
  function validateForm() {
    let isValid = true;
    
    CONFIG.ratingGroupIds.forEach(id => {
      const group = document.getElementById(id);
      const selected = group ? group.querySelector('.selected') : null;
      const errorEl = document.getElementById(`error-${id.replace('rating-', '')}`);

      if (!selected) {
        if (errorEl) errorEl.textContent = 'Por favor, selecione uma nota.';
        isValid = false;
      }
    });

    const feedbackVal = elements.feedback?.value.trim();
    const errorFeedback = document.getElementById('error-feedback');
    
    if (!feedbackVal) {
      if (errorFeedback) errorFeedback.textContent = 'Este campo é obrigatório.';
      isValid = false;
    }

    if (!isValid) {
      const firstError = document.querySelector('.error-msg:not(:empty)');
      if(firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return isValid;
  }

  // Envio do formulário para Supabase
  function setupFormSubmission() {
    if (!elements.submitBtn) return;

    elements.submitBtn.addEventListener('click', async () => {
      if (state.isSubmitting || state.isSubmitted) return;
      if (!validateForm()) return;

      // Estado de processamento
      state.isSubmitting = true;
      elements.submitBtn.classList.add('loading');
      elements.submitBtn.disabled = true;
      elements.submitBtn.textContent = 'Processando...';
      elements.processingMsg.classList.remove('hidden');

      try {
        // Coleta dados das notas
        const ratings = CONFIG.ratingGroupIds.map(id => {
          const selectedBtn = document.querySelector(`#${id} .selected`);
          return selectedBtn ? parseInt(selectedBtn.dataset.value, 10) : null;
        });

        const feedback = elements.feedback.value.trim();

        // Envio para Supabase
        const { error } = await supabase
          .from('respostas_nps')
          .insert({
            identificador: state.identificador,  // Ex: "RAFAELLA ARAÚJO"
            nota_q1: ratings[0],
            nota_q2: ratings[1],
            nota_q3: ratings[2],
            nota_q4: ratings[3],
            feedback: feedback,
            timestamp: new Date().toISOString()
          });

        if (error) throw error;

        // Sucesso
        handleSuccess();

      } catch (error) {
        console.error('Erro ao enviar para Supabase:', error);
        alert('Ocorreu um erro ao salvar sua resposta. Tente novamente.');
        stopProcessing();
      }
    });
  }

  // Fechar tela de sucesso e resetar formulário
  function setupCloseSuccess() {
    if (elements.closeBtn && elements.successScreen) {
      elements.closeBtn.addEventListener('click', () => {
        resetForm();
      });
    }

    if (elements.successScreen) {
      elements.successScreen.addEventListener('click', (e) => {
        if (e.target === elements.successScreen) {
          resetForm();
        }
      });
    }
  }

  function handleSuccess() {
    state.isSubmitted = true;
    document.body.classList.add('submitted');
    
    elements.processingMsg.classList.add('hidden');
    elements.successScreen.classList.remove('hidden');
  }

  function stopProcessing() {
    state.isSubmitting = false;
    elements.submitBtn.classList.remove('loading');
    elements.submitBtn.disabled = false;
    elements.submitBtn.textContent = 'Enviar Respostas';
    elements.processingMsg.classList.add('hidden');
  }

  // Reset total do formulário
  function resetForm() {
    elements.successScreen.classList.add('hidden');
    document.querySelectorAll('.rating .selected').forEach(btn => btn.classList.remove('selected'));
    if (elements.feedback) elements.feedback.value = '';
    elements.errorMessages.forEach(el => el.textContent = '');
    stopProcessing();
    document.body.classList.remove('submitted');
    state.isSubmitted = false;
  }

  // Inicializa
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();