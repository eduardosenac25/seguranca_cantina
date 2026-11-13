import { prisma } from "../../lib/prisma"
import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import nodemailer from 'nodemailer'
import { randomInt } from 'node:crypto'

const router = Router()

const usuarioSchema = z.object({
  nome: z.string().min(10,
    { message: "Nome deve possuir, no mínimo, 10 caracteres" }),
  email: z.string().email().min(10,
    { message: "E-mail, no mínimo, 10 caracteres" }),
  senha: z.string()  
})

router.get("/", async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      omit: { recuperaSenha: true, recuperaExpira: true }
    })
    res.status(200).json(usuarios)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

function validaSenha(senha: string) {

  const mensa: string[] = []

  // .length: retorna o tamanho da string (da senha)
  if (senha.length < 8) {
    mensa.push("Erro... senha deve possuir, no mínimo, 8 caracteres")
  }

  // contadores
  let pequenas = 0
  let grandes = 0
  let numeros = 0
  let simbolos = 0

  // senha = "abc123"
  // letra = "a"

  // percorre as letras da variável senha
  for (const letra of senha) {
    // expressão regular
    if ((/[a-z]/).test(letra)) {
      pequenas++
    }
    else if ((/[A-Z]/).test(letra)) {
      grandes++
    }
    else if ((/[0-9]/).test(letra)) {
      numeros++
    } else {
      simbolos++
    }
  }

  if (pequenas == 0) {
    mensa.push("Erro... senha deve possuir letra(s) minúscula(s)")
  }

  if (grandes == 0) {
    mensa.push("Erro... senha deve possuir letra(s) maiúscula(s)")
  }

  if (numeros == 0) {
    mensa.push("Erro... senha deve possuir número(s)")
  }

  if (simbolos == 0) {
    mensa.push("Erro... senha deve possuir símbolo(s)")
  }

  return mensa
}

router.post("/", async (req, res) => {

  const valida = usuarioSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error })
    return
  }

  const { nome, email, senha } = valida.data

  const mensaErros = validaSenha(senha)

  if (mensaErros.length > 0) {
    res.status(400).json({erro: mensaErros})
    return
  }

  // gera um "salt" (sal/tempero) que é acrescentado a senha
  // 12 é o número de voltas (repetições) feitas na geração do salt
  // que o torna mais lento (útil para evitar/atrasar ataques de força bruta)
  const salt = bcrypt.genSaltSync(12)

  // gera o hash da senha acrescida do salt
  const hash = bcrypt.hashSync(senha, salt)  

  try {
    const usuario = await prisma.usuario.create({
      data: { nome, email, senha: hash }
    })
    res.status(201).json(usuario)
  } catch (error) {
    res.status(400).json({ error })
  }
})

router.delete("/:id", async (req, res) => {
  const { id } = req.params

  try {
    const usuario = await prisma.usuario.delete({
      where: { id: Number(id) }
    })
    res.status(200).json(usuario)
  } catch (error) {
    res.status(400).json({ erro: error })
  }
})

// ---------------------------------------------------------------------
// Recuperação de senha
//   1) POST /usuarios/esqueci-senha   -> gera o código e envia por e-mail
//   2) PUT  /usuarios/redefinir-senha -> confere o código e troca a senha
// ---------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
})

// validade do código (em minutos)
const VALIDADE_CODIGO_MIN = 15

// letras e números, sem caracteres que se confundem (0/O, 1/I)
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// gera código de 4 caracteres (randomInt usa gerador criptograficamente seguro)
function geraCodigo() {
  let codigo = ""
  for (let i = 0; i < 4; i++) {
    codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]
  }
  return codigo
}

const esqueciSenhaSchema = z.object({
  email: z.email({ message: "Informe um e-mail válido" })
})

const redefinirSenhaSchema = z.object({
  email: z.email({ message: "Informe um e-mail válido" }),
  codigo: z.string({ error: "Informe o código recebido por e-mail" })
    .length(4, { message: "O código deve possuir 4 caracteres" }),
  senha: z.string({ error: "Informe a nova senha" })
})

// 1ª rotina: usuário solicita a recuperação da senha
router.post("/esqueci-senha", async (req, res) => {
  const valida = esqueciSenhaSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues.map(e => e.message) })
    return
  }

  const { email } = valida.data

  // mesma resposta exista ou não o e-mail (não dá "dicas" para hackers,
  // mesmo raciocínio da mensagem padrão do login)
  const mensaPadrao = "Se o e-mail estiver cadastrado, enviamos um código de recuperação"

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } })

    if (usuario == null) {
      res.status(200).json({ mensa: mensaPadrao })
      return
    }

    const codigo = geraCodigo()
    const expira = new Date(Date.now() + VALIDADE_CODIGO_MIN * 60 * 1000)

    // salva o código (e a validade) no cadastro do usuário
    await prisma.usuario.update({
      where: { email },
      data: { recuperaSenha: codigo, recuperaExpira: expira }
    })

    await transporter.sendMail({
      from: 'Cantina Escolar <cantina@gmail.com>',
      to: email,
      subject: "Recuperação de senha",
      text: `Seu código de recuperação de senha é: ${codigo}\n` +
            `Ele é válido por ${VALIDADE_CODIGO_MIN} minutos. ` +
            `Se você não fez esta solicitação, ignore este e-mail.`,
      html: `<p>Seu código de recuperação de senha é:</p>
             <h2 style="letter-spacing: 4px;">${codigo}</h2>
             <p>Ele é válido por ${VALIDADE_CODIGO_MIN} minutos.</p>
             <p>Se você não fez esta solicitação, ignore este e-mail.</p>`
    })

    res.status(200).json({ mensa: mensaPadrao })
  } catch (error) {
    console.log(error)
    res.status(500).json({ erro: "Não foi possível processar a solicitação" })
  }
})

// 2ª rotina: recebe e-mail, código (enviado por e-mail) e a nova senha
router.put("/redefinir-senha", async (req, res) => {
  const valida = redefinirSenhaSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues.map(e => e.message) })
    return
  }

  const { email, codigo, senha } = valida.data

  // regras de composição da nova senha (as mesmas do cadastro)
  const mensaErros = validaSenha(senha)
  if (mensaErros.length > 0) {
    res.status(400).json({ erro: mensaErros })
    return
  }

  // mensagem única: não revela se o e-mail não existe, se o código está
  // errado ou se expirou
  const mensaPadrao = "Código inválido ou expirado"

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } })

    if (usuario == null ||
        usuario.recuperaSenha == null ||
        usuario.recuperaExpira == null ||
        usuario.recuperaSenha !== codigo.toUpperCase() ||
        usuario.recuperaExpira < new Date()) {
      res.status(400).json({ erro: mensaPadrao })
      return
    }

    const salt = bcrypt.genSaltSync(12)
    const hash = bcrypt.hashSync(senha, salt)

    // troca a senha e invalida o código (só pode ser usado uma vez)
    await prisma.usuario.update({
      where: { email },
      data: { senha: hash, recuperaSenha: null, recuperaExpira: null }
    })

    res.status(200).json({ mensa: "Senha alterada com sucesso" })
  } catch (error) {
    console.log(error)
    res.status(500).json({ erro: "Não foi possível alterar a senha" })
  }
})

export default router
