require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const pool = mysql.createPool({
    host: process.env.MYSQLHOST,
    port: process.env.MYSQLPORT || 3306,            
    user: process.env.MYSQLUSER,          
    password: process.env.MYSQLPASSWORD,            
    database: process.env.MYSQLDATABASE,
    waitForConnections: true,
    connectionLimit: 5,   // Keep it around 5 to stay safely under Aiven's free connection cap
    queueLimit: 0
});

// 1. Fetch all quizzes for the Main Page
/**
 * @route   GET /api/quizzes
 * @desc    Fetch all quizzes
 * @access  Public
 * 
 * @returns {Array} 200 - Array of quizzes
 * @returns {object} 500 - Error fetching quizzes
 */
app.get('/api/quizzes', async (req, res) => {
    console.log('GET /api/quizzes');
    
    try {
        const [rows] = await pool.query(
            'SELECT id, title, created_at FROM Quiz ORDER BY created_at DESC'
        );
        console.log('Response: 200 - Quizzes fetched:', rows.length, 'items');
        res.json(rows);
    } catch (error) {
        console.log('Response: 500 - Error fetching quizzes:', error.message);
        res.status(500).json({ error: 'Database error fetching quizzes.', details: error.message });
    }
});

// 3. Get correct answer of a question
/**
 * @route   GET /api/quizz/correct
 * @desc    Get correct answer of a question
 * @access  Public
 * 
 * @param   {string} req.query.question - The unique ID of the question
 * @returns {object} 200 - Correct answer
 * @returns {object} 500 - Error fetching answer
 */
app.get('/api/quiz/correct', async (req, res)=>{
    console.log('GET /api/quiz/correct - questionId:', req.query.question);
    const questionId = req.query.question;
    try {
        const [answer_id] = await pool.query('SELECT correct_option_id FROM Question WHERE id = ?',
            [questionId]
        );
        const correctOptionId=answer_id[0].correct_option_id;
        const [answer] = await pool.query('SELECT id, option_text FROM `Option` WHERE id = ?',
            [correctOptionId]
        );
        console.log('Response: 200 - Correct answer retrieved');
        res.json({
            correct_option_id: correctOptionId,
            answer: answer[0]
        })

    }
    catch (error) {
        console.log('Response: 500 - Error fetching correct answer:', error.message);
        res.status(500).json({ error: 'Evaluation engine failure.', details: error.message });
    }
});

// 2a. Fetch a question
/**
 * @route   GET /api/quizz/:id
 * @desc    Fetch a question
 * @access  Public
 * 
 * @param   {string} req.params.id - The unique ID of the quiz
 * @param   {string} req.query.question - The unique ID of the question
 * @returns {object} 200 - Question text and options
 * @returns {object} 500 - Error fetching question
 */
app.get('/api/quiz/:id', async (req, res)=>{
    console.log('GET /api/quiz/:id - quizId:', req.params.id, 'questionId:', req.query.question);
    const quizId = req.params.id;
    const questionId = req.query.question;
    try {
        const [text] = await pool.query('SELECT question_text FROM Question WHERE quiz_id = ? AND id = ?', [quizId, questionId]);
        const [options] = await pool.query('SELECT id, option_text FROM `Option` WHERE question_id = ?', [questionId]);
        const [images] = await pool.query('SELECT image_url FROM Q_IMAGE WHERE question_id = ?', [questionId]);
        console.log('Response: 200 - Question fetched with', options.length, 'options');
        res.json({
            question: text[0],
            options: options,
            images: images
        });
    }
    catch (error) {
        console.log('Response: 500 - Error fetching question:', error.message);
        res.status(500).json({ error: 'Database error fetch question', details: error.message });
    }
});

// 2b. Get number of questions
/**
 * @route   GET /api/quiz/:id/count
 * @desc    Get the number of questions in a quiz
 * @access  Public
 * 
 * @param   {string} req.params.id - The unique ID of the quiz
 * @returns {object} 200 - Question count
 * @returns {object} 500 - Error fetching count
 */
app.get('/api/quiz/:id/count', async (req, res) => {
    console.log('GET /api/quiz/:id/count - quizId:', req.params.id);
    const quizId = req.params.id;
    try {
        const [rows] = await pool.query(
            'SELECT COUNT(*) AS question_count FROM Question WHERE quiz_id = ?',
            [quizId]
        );
        console.log('Response: 200 - Question count retrieved:', rows[0].question_count);
        res.json({
            quiz_id: quizId,
            question_count: rows[0].question_count
        });
    } catch (error) {
        console.log('Response: 500 - Error fetching question count:', error.message);
        res.status(500).json({ error: 'Database error fetching question count.', details: error.message });
    }
});

// 2c. Get list of question IDs for a quiz
/**
 * @route   GET /api/quiz/:id/questions
 * @desc    Get the list of question IDs for a quiz
 * @access  Public
 *
 * @param   {string} req.params.id - The unique ID of the quiz
 * @returns {object} 200 - { quiz_id, questions: [{id}] }
 * @returns {object} 500 - Error fetching list
 */
app.get('/api/quiz/:id/questions', async (req, res) => {
    console.log('GET /api/quiz/:id/questions - quizId:', req.params.id);
    const quizId = req.params.id;
    try {
        const [rows] = await pool.query(
            'SELECT id FROM Question WHERE quiz_id = ? ORDER BY id ASC',
            [quizId]
        );
        console.log('Response: 200 - Question list retrieved:', rows.length);
        res.json({
            quiz_id: quizId,
            questions: rows
        });
    } catch (error) {
        console.log('Response: 500 - Error fetching question list:', error.message);
        res.status(500).json({ error: 'Database error fetching question list.', details: error.message });
    }
});



// 4. Evaluate quiz
/**
 * @route   POST /api/quizz/:id/submit
 * @desc    Get final score of quiz
 * @access  Public
 * 
 * @param   {string} req.params.id - The unique ID of the quiz
 * @param   {Array} req.body.answers - Array of {question_id, correct_option_id}
 * @returns {object} 200 - Final score
 * @returns {object} 500 - Error submitting
 */
app.post('/api/quiz/:id/submit', async (req, res) =>{
    console.log('POST /api/quiz/:id/submit - quizId:', req.params.id, 'answersCount:', req.body.answers?.length);
    const quizId = req.params.id;
    const answers = req.body.answers;
    try{
        const [questions] = await pool.query('SELECT id, correct_option_id FROM Question WHERE quiz_id = ?', 
            [quizId]
        );
        const correctMap = {};
        questions.forEach(q => correctMap[q.id] = q.correct_option_id);

        const score = answers.reduce((acc, answer) => {
            return (correctMap[answer.question_id] === answer.selected_option_id) ? acc + 1 : acc;
        }, 0);

        console.log('Response: 200 - Quiz submitted, score:', score, '/', questions.length);
        res.json({
            score: score,
            total_questions: questions.length
        });
    }
    catch (error) {
        console.log('Response: 500 - Error submitting quiz:', error.message);
        res.status(500).json({ error: 'Bulk evaluation mapping failed.', details: error.message });
    }
});

// 5. Delete a quiz
/**
 * @route   DELETE /api/quiz/:id
 * @desc    Delete quiz
 * @access  Public
 * 
 * @param   {string} req.params.id - The unique ID of the quiz
 * @returns {object} 200 - Success
 * @returns {object} 500 - Error deleting quiz
 */
app.delete('/api/quiz/:id', async (req, res) => {
    console.log('DELETE /api/quiz/:id - quizId:', req.params.id);
    try {
        await pool.query('DELETE FROM Quiz WHERE id = ?', [req.params.id]);
        console.log('Response: 200 - Quiz deleted successfully');
        res.json({ message: 'Quiz deleted successfully (cascading completed).' });
    } catch (error) {
        console.log('Response: 500 - Error deleting quiz:', error.message);
        res.status(500).json({ error: 'Deletion dependency failure.', details: error.message });
    }
});

async function insertParsedQuestion(connection, quizId, questionData) {
    // 1. Insert question stem without correct answer reference
    const [qResult] = await connection.query(
        'INSERT INTO Question (quiz_id, question_text, correct_option_id) VALUES (?, ?, NULL)',
        [quizId, questionData.question_text]
    );
    const questionId = qResult.insertId;

    // 2. Loop through options and track database mapping IDs
    let correctOptionDbId = null;
    for (let optText of questionData.options) {
        const [optResult] = await connection.query(
            'INSERT INTO `Option` (question_id, option_text) VALUES (?, ?)',
            [questionId, optText]
        );
        // Identify if this newly created option matches what the file marked as correct
        if (optText.trim() === questionData.correct_option.trim()) {
            correctOptionDbId = optResult.insertId;
        }
    }

    // 3. Establish structural integrity link
    if (correctOptionDbId) {
        await connection.query(
            'UPDATE Question SET correct_option_id = ? WHERE id = ?',
            [correctOptionDbId, questionId]
        );
    }

    // 4. Track local optional image associations if present
    if (questionData.images && Array.isArray(questionData.images)) {
        for (let imgPath of questionData.images) {
            await connection.query(
                'INSERT INTO Q_IMAGE (question_id, image_url) VALUES (?, ?)',
                [questionId, imgPath]
            );
        }
    }
}

// 6. Upload json file
/**
 * @route   POST /api/quiz/upload
 * @desc    Upload quiz
 * @access  Public
 * 
 * @param   {object} req.file - File to upload
 * @param   {string} req.body.title - Quiz title
 * @returns {object} 200 - Success
 * @returns {object} 500 - Error deleting quiz
 */
app.post('/api/quiz/upload', upload.single('file'), async (req, res) =>{
    console.log('POST /api/quiz/upload - title:', req.body.title, 'fileName:', req.file?.originalname);
    const quizTitle = req.body.title;
    try{
        const fileContent = req.file.buffer.toString('utf-8');
        const parsedQuestions = JSON.parse(fileContent);
    }
    catch (parseErr) {
        console.log('Response: 400 - File parse error:', parseErr.message);
        return res.status(400).json({ error: 'Format standard parsing violation.', details: parseErr.message });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [quizResult] = await connection.query('INSERT INTO Quiz (title) VALUES (?)', [quizTitle]);
        const quizId = quizResult.insertId;

        for (let questionData of parsedQuestions) {
            await insertParsedQuestion(connection, quizId, questionData);
        }

        await connection.commit();
        console.log('Response: 201 - Quiz uploaded successfully, ID:', quizId, 'questions:', parsedQuestions.length);
        res.status(201).json({ message: 'Quiz uploaded successfully', quiz_id: quizId, questions_count: parsedQuestions.length });
    }
    catch (transactionError) {
        await connection.rollback();
        console.log('Response: 500 - Transaction failed:', transactionError.message);
        res.status(500).json({ error: 'Transaction failed. Changes rolled back.', details: transactionError.message });
    } 
    finally {
        connection.release();
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Running`));