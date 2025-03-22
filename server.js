require('dotenv').config(); 
const express = require('express'); 
const app = express(); 
const jwt = require('jsonwebtoken');
const cors = require('cors');


const productsRoutes = require('./src/routes/productsRoutes');
const categoriesRoutes = require('./src/routes/categoriesRoutes');
const ExpressCheckoutRoutes = require('./src/routes/ExpressCheckoutRoutes');



app.use(express.json());


const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
  
    if (!token) {
      return res.status(403).json({ error: 'Token no proporcionado' });
    }
  
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Token no válido' });
      }

      req.user = user;
      next();
    });
  };

  const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = ['https://agrojardin.vercel.app', 'http://localhost:5173'];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORSSS'));
        }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));


app.use('/api', productsRoutes);
app.use('/api', categoriesRoutes);
app.use('/api', ExpressCheckoutRoutes);


const PORT = process.env.PORT || 3000;


// Inicia el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});