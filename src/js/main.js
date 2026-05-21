const API_BASE = '/api';  

let activeDeleteQuizId = null;
let deleteOverlay = null;
let deleteConfirmButton = null;
let deleteCancelButton = null;

window.addEventListener('DOMContentLoaded', () => {
    setupDeleteConfirm();
    fetchAndRenderQuizDirectory();
});

function setupDeleteConfirm() {
    const deleteTemplate = document.getElementById('delete-confirm');
    if (!deleteTemplate) return;

    const clone = deleteTemplate.content.cloneNode(true);
    document.body.appendChild(clone);

    deleteOverlay = document.querySelector('.confirm-overlay');
    if (!deleteOverlay) return;

    deleteConfirmButton = deleteOverlay.querySelector('.btn-confirm-delete');
    deleteCancelButton = deleteOverlay.querySelector('.btn-cancel');

    deleteConfirmButton.addEventListener('click', async () => {
        if (activeDeleteQuizId) {
            await deleteQuizRecord(activeDeleteQuizId);
        }
    });

    deleteCancelButton.addEventListener('click', hideDeleteConfirm);
    deleteOverlay.addEventListener('click', (event) => {
        if (event.target === deleteOverlay) {
            hideDeleteConfirm();
        }
    });
}

async function fetchAndRenderQuizDirectory() {
    const listContainer = document.getElementById('quiz-list-target');
    const template = document.getElementById('card-template');
    
    try {
        const response = await fetch(`${API_BASE}/quizzes`);
        const quizzes = await response.json();

        // 1. Clear previous list items safely
        listContainer.innerHTML = '';

        if (quizzes.length === 0) {
            // Target the 'no-card' template element
            const noQuizTemplate = document.getElementById('no-card');
            
            // Clone its contents
            const clone = noQuizTemplate.content.cloneNode(true);
            
            // Append the cloned DOM fragment into your container
            listContainer.appendChild(clone);
            return;
        }

        // 2. Loop through and clone the template for each quiz
        quizzes.forEach(quiz => {
            // "true" creates a deep clone, copying all children tags inside the template
            const clone = template.content.cloneNode(true);
            
            // Get the root element of your quiz-card.njk file inside the clone
            const item = clone.firstElementChild; 

            // 3. Safely populate text content (protects against XSS)
            item.querySelector('.quiz-title').textContent = quiz.title;
            item.querySelector('.quiz-date').textContent = `Added: ${new Date(quiz.created_at).toLocaleDateString()}`;

            // 4. Attach interactive behavior directly to the cloned DOM nodes
            item.querySelector('.btn-start').addEventListener('click', async (event) => {
                const button = event.currentTarget;
                const originalText = button.textContent;
                button.textContent = 'Loading...';
                button.disabled = true;
                button.classList.add('is-loading');

                try {
                    await initiateQuizSessionSetup(quiz.id);
                } catch (error) {
                    console.error('Navigation or setup failed:', error);
                    // Fallback reset if the application fails to redirect or crashes
                    button.textContent = originalText;
                    button.disabled = false;
                    button.classList.remove('is-loading');
                }
            });

            item.querySelector('.btn-delete').addEventListener('click', () => {
                showDeleteConfirm(quiz.id, quiz.title);
            });

            // 5. Append the freshly populated node into the live list
            listContainer.appendChild(item);
        });
    } catch (error) {
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        const connectErrorTemplate = document.getElementById('connect-error');
            
        // Clone its contents
        const clone = connectErrorTemplate.content.cloneNode(true);
        
        // Append the cloned DOM fragment into your container
        listContainer.appendChild(clone);
    }
}

async function initiateQuizSessionSetup(quizId) {
    

    sessionStorage.setItem("randomizeQ", document.getElementById('cfg-rand-q').checked);
    sessionStorage.setItem("randomizeA", document.getElementById('cfg-rand-a').checked);
    sessionStorage.setItem("imediateMode", document.querySelector('input[name="cfg-feedback"]:checked').value === 'per-q');

    window.location.href=`quiz?id=${quizId}`;
};

function showDeleteConfirm(quizId, title) {
    activeDeleteQuizId = quizId;
    if (!deleteOverlay) return;

    const message = deleteOverlay.querySelector('.confirm-message');
    message.textContent = `Delete "${title}"? This action cannot be undone.`;
    deleteOverlay.classList.add('visible');
}

function hideDeleteConfirm() {
    activeDeleteQuizId = null;
    if (!deleteOverlay) return;
    deleteOverlay.classList.remove('visible');
}

async function deleteQuizRecord(quizId) {
    try {
        const response = await fetch(`${API_BASE}/quiz/${quizId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || 'Could not delete quiz.');
        }

        hideDeleteConfirm();
        await fetchAndRenderQuizDirectory();
    } catch (error) {
        console.error('Delete failed:', error.message);
        alert('Unable to delete the quiz. Please try again.');
    }
}




