const API_BASE = 'http://localhost:3000/api';

let sessionState = {
    currentQuizId: null,
    questionList: [],      // Holds the lightweight array of [{id: 1}, {id: 2}]
    questionCache: {},     // Local cache mapping question ID to its fetched data
    activeIndex: 0,
    config: { randomizeQ: false, randomizeA: false, immediateMode: true },
    userSelections: {}, 
    lockedQuestions: {}
};

// Initialize immediately on page load
window.addEventListener('DOMContentLoaded', initializeQuizContext);

async function initializeQuizContext() {
    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('id');

    if (!quizId) {
        alert('Invalid quiz session. Redirecting to main menu.');
        window.location.href = '/';
        return;
    }

    sessionState.config.randomizeQ = sessionStorage.getItem('randomizeQ') === 'true';
    sessionState.config.randomizeA = sessionStorage.getItem('randomizeA') === 'true';
    sessionState.config.immediateMode = sessionStorage.getItem('imediateMode') === 'true'; 
    
    sessionState.currentQuizId = quizId;

    await fetchQuestionDirectory(quizId);
}

// Step 1: Fetch only the list of Question IDs
async function fetchQuestionDirectory(quizId) {
    try {
        document.body.style.cursor = 'wait';
        const response = await fetch(`${API_BASE}/quiz/${quizId}/questions`);
        if (!response.ok) throw new Error('Could not retrieve question list.');
        
        const data = await response.json();
        let rawList = data.questions;

        // Apply question shuffle to the ID list if configured
        if (sessionState.config.randomizeQ) {
            rawList.sort(() => Math.random() - 0.5);
        }

        sessionState.questionList = rawList;
        sessionState.activeIndex = 0;
        sessionState.userSelections = {};
        sessionState.lockedQuestions = {};
        sessionState.questionCache = {}; // Reset local cache

        generateNavigationMatrix();
        await loadAndRenderQuestion(sessionState.activeIndex);
        
        document.body.style.cursor = 'auto';
    } catch (err) {
        document.body.style.cursor = 'auto';
        alert(`Error initializing practice session: ${err.message}`);
    }
}

// Step 2: Lazy Load a specific question by index
async function loadAndRenderQuestion(index) {
    if (sessionState.questionList.length === 0) return;
    
    const targetQuestionId = sessionState.questionList[index].id;

    // Check if we already fetched this question
    if (!sessionState.questionCache[targetQuestionId]) {
        try {
            document.body.style.cursor = 'wait';
            const response = await fetch(`${API_BASE}/quiz/${sessionState.currentQuizId}?question=${targetQuestionId}`);
            if (!response.ok) throw new Error('Failed to fetch question data.');
            
            const questionData = await response.json();
            
            // Apply option shuffle if configured
            if (sessionState.config.randomizeA) {
                questionData.options.sort(() => Math.random() - 0.5);
            }

            // Save to local cache
            sessionState.questionCache[targetQuestionId] = questionData;
            document.body.style.cursor = 'auto';
        } catch (err) {
            document.body.style.cursor = 'auto';
            alert(`Error loading question: ${err.message}`);
            return;
        }
    }

    renderActiveQuestionCanvas(index, targetQuestionId);
}

function generateNavigationMatrix() {
    const container = document.getElementById('matrix-target');
    if (!container) return;
    
    container.innerHTML = '';
    sessionState.questionList.forEach((q, index) => {
        const cell = document.createElement('div');
        cell.className = 'matrix-cell';
        cell.innerText = index + 1;
        cell.id = `matrix-cell-${index}`;
        cell.onclick = () => jumpToQuestionIndex(index);
        container.appendChild(cell);
    });
    updateMatrixHighlightStyles();
}

function updateMatrixHighlightStyles() {
    sessionState.questionList.forEach((q, index) => {
        const cell = document.getElementById(`matrix-cell-${index}`);
        if (!cell) return;
        
        cell.className = 'matrix-cell'; // Reset classes
        if (index === sessionState.activeIndex) cell.classList.add('active');
        if (sessionState.userSelections[q.id] !== undefined) cell.classList.add('answered');
    });
}

function renderActiveQuestionCanvas(index, questionId) {
    const currentData = sessionState.questionCache[questionId];
    if (!currentData) return;

    // Notice the updated object pathing based on your API response structure 
    document.getElementById('canvas-question-text').innerText = `${index + 1}. ${currentData.question.question_text}`;
    
    // Render Images
    const gallery = document.getElementById('canvas-image-gallery');
    if (gallery) {
        gallery.innerHTML = '';
        if (currentData.images && currentData.images.length > 0) {
            currentData.images.forEach(imgObj => {
                const img = document.createElement('img');
                img.src = imgObj.image_url.startsWith('http') ? imgObj.image_url : `http://127.0.0.1:3000${imgObj.image_url}`;
                img.className = 'quiz-image';
                gallery.appendChild(img);
            });
        }
    }

    // Render Options
    const optionsBox = document.getElementById('canvas-options-box');
    optionsBox.innerHTML = '';
    
    const isLocked = sessionState.lockedQuestions[questionId] !== undefined;

    currentData.options.forEach(opt => {
        const node = document.createElement('div');
        node.className = 'option-node';
        node.innerText = opt.option_text;

        if (isLocked) {
            node.classList.add('disabled');
            const correctId = sessionState.lockedQuestions[questionId].correct_id;
            if (Number(opt.id) === Number(correctId)) node.classList.add('correct');
            if (Number(sessionState.userSelections[questionId]) === Number(opt.id) && Number(opt.id) !== Number(correctId)) {
                node.classList.add('incorrect');
            }
        } else {
            if (sessionState.userSelections[questionId] === opt.id) node.classList.add('selected');
            node.onclick = () => selectOptionChoice(questionId, opt.id);
        }
        optionsBox.appendChild(node);
    });

    // Handle Button States
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnCheck = document.getElementById('btn-check');
    const btnSubmit = document.getElementById('btn-submit-quiz');

    if (btnPrev) btnPrev.disabled = sessionState.activeIndex === 0;
    if (btnNext) btnNext.disabled = sessionState.activeIndex === sessionState.questionList.length - 1;
    
    if (sessionState.config.immediateMode) {
        if (btnCheck) {
            btnCheck.style.display = 'block';
            btnCheck.disabled = isLocked || sessionState.userSelections[questionId] === undefined;
        }
        if (btnSubmit) btnSubmit.style.display = 'none';
    } else {
        if (btnCheck) btnCheck.style.display = 'none';
        const isLastQuestion = sessionState.activeIndex === sessionState.questionList.length - 1;
        if (btnSubmit) btnSubmit.style.display = isLastQuestion ? 'block' : 'none';
    }
    
    updateMatrixHighlightStyles();
}

function selectOptionChoice(questionId, optionId) {
    sessionState.userSelections[questionId] = optionId;
    renderActiveQuestionCanvas(sessionState.activeIndex, questionId);
}

async function jumpToQuestionIndex(index) {
    sessionState.activeIndex = index;
    await loadAndRenderQuestion(index);
}

async function stepActiveIndex(direction) {
    let nextTarget = sessionState.activeIndex + direction;
    if (nextTarget >= 0 && nextTarget < sessionState.questionList.length) {
        sessionState.activeIndex = nextTarget;
        await loadAndRenderQuestion(nextTarget);
    }
}

// Updated Immediate Mode Check targeting the new endpoint
async function evaluateActiveQuestionImmediate() {
    const currentQuestionId = sessionState.questionList[sessionState.activeIndex].id;
    
    try {
        // Utilizing the new API endpoint structure: /api/quiz/correct?question={id}
        const response = await fetch(`${API_BASE}/quiz/correct?question=${currentQuestionId}`);
        if (!response.ok) throw new Error('Evaluation check failed');
        
        const data = await response.json();
        
        sessionState.lockedQuestions[currentQuestionId] = { correct_id: data.correct_option_id };
        renderActiveQuestionCanvas(sessionState.activeIndex, currentQuestionId);
    } catch (err) {
        alert('Error grading question item response.');
    }
}

// Bulk Mode Submit remains largely the same, feeding the array of selections
async function compileAndSubmitAll() {
    const formattedAnswers = Object.keys(sessionState.userSelections).map(qId => ({
        question_id: parseInt(qId),
        selected_option_id: sessionState.userSelections[qId]
    }));

    try {
        const response = await fetch(`${API_BASE}/quiz/${sessionState.currentQuizId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: formattedAnswers })
        });
        const evaluationResult = await response.json();

        document.getElementById('results-score').innerText = evaluationResult.score;
        document.getElementById('results-total').innerText = evaluationResult.total_questions;
        
        const ratio = evaluationResult.total_questions > 0 ? (evaluationResult.score / evaluationResult.total_questions) * 100 : 0;
        document.getElementById('results-percentage').innerText = `${Math.round(ratio)}%`;

        showResultsView();
    } catch (err) {
        alert('Failed to transmit bulk execution parameters to database engine.');
    }
}

function showResultsView() {
    const quizContainer = document.getElementById('quiz-container'); 
    const resultsContainer = document.getElementById('results-container'); 

    if (quizContainer) quizContainer.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'block';
}

function abortSessionToMain() {
    window.location.href = '/'; 
}