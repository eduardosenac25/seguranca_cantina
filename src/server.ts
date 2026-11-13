import express from 'express'
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "../swagger-output.json";

const app = express()
const port = 3000

import routesAlunos from "./routes/alunos"
import routesDepositos from "./routes/depositos"
import routesProdutos from "./routes/produtos"
import routesVendas from "./routes/vendas"
import routesUsuarios from './routes/usuarios'
import routesLogin from './routes/login'

app.use(express.json())

// Documentação Swagger
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/alunos", routesAlunos)
app.use("/depositos", routesDepositos)
app.use("/produtos", routesProdutos)
app.use("/vendas", routesVendas)
app.use("/usuarios", routesUsuarios)
app.use("/login", routesLogin)

app.get('/', (req, res) => {
  res.send('API: Sistema de Controle de Cantina Escolar')
})

app.listen(port, () => {
  console.log(`Servidor Rodando na Porta: ${port}`)
})
