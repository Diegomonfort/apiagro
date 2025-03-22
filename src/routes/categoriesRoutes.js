const express = require('express');
const {getCategories, deleteCategories, updateCategory} = require('../controllers/categorias');
const multer = require('multer');
const upload = multer();

const router = express.Router();

router.get('/categories', getCategories);
router.patch('/categories/:id', upload.single('Imagen'), updateCategory);
router.delete('/categories/:id', deleteCategories);





module.exports = router;