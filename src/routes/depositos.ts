import { prisma } from "../../lib/prisma"
import { Router } from "express"
import { z } from "zod"

const router = Router()

export const depositoSchema = z.object({
    alunoId: z.number().int()
      .positive('ID do aluno deve ser um número positivo'),
    tipo: z.enum(["PIX", "Dinheiro", "Depósito"], {
      message: "Opção inválida. Escolha entre PIX, Dinheiro ou Depósito."
    }),
    valor: z.number()
      .positive('Valor deve ser um número positivo'),
})

router.get("/", async (req, res) => {
   /*
    #swagger.tags = ['Depósitos']
   */

    try {
        const depositos = await prisma.deposito.findMany({
            include: { aluno: true }
        })
        res.status(200).json(depositos)
    } catch (error) {
        res.status(500).json({ erro: "Erro no servidor" })
    }
})

router.post("/", async (req, res) => {
   /*
    #swagger.tags = ['Depósitos']
    #swagger.summary = 'Cadastra um depósito'
    #swagger.description = 'Realiza o cadastro de um novo depósito para o aluno.'

    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        alunoId: 3,
        valor: 50,
        tipo: 'PIX / Depósito / Dinheiro'
      }
    }

    #swagger.responses[201] = {
      description: 'Depósito realizado com sucesso.'
    }

    #swagger.responses[400] = {
      description: 'Dados inválidos.'
    }

    #swagger.responses[500] = {
      description: 'Erro interno no Servidor'
    }
   */

    const valida = depositoSchema.safeParse(req.body)

    if (!valida.success) {
      const erros = valida.error.issues.map(e => ({
        campo:    e.path[0],
        mensagem: e.message,
      }))
      res.status(400).json({ erros })
      return
    }

    // Desestrutura os dados validados
    const { alunoId, valor, tipo } = valida.data

    const aluno = await prisma.aluno.findUnique({
        where: { id: alunoId }
    })

    if (!aluno) {
        res.status(404).json({ erro: 'Aluno não cadastrado' })
        return
    }

    try {
        // Transação para incluir o depósito e alterar o saldo do aluno
        const [deposito, aluno] = await prisma.$transaction([
           prisma.deposito.create({ data: { alunoId, tipo, valor }}),
           prisma.aluno.update({
            data: { saldo: { increment: valor }},
            where: { id: alunoId }
           })
        ])        
        res.status(201).json({deposito, aluno})
    } catch (error) {
        res.status(500).json({ error })
    }
})

router.delete("/:id", async (req, res) => {
    // recebe o id passado como parâmetro
    const { id } = req.params

    // realiza a exclusão do depósito
    try {
        // pesquisa / obtém dados do depósito a ser excluído
        const depositoExcluido = await prisma.deposito.findUnique(
            { where: { id: Number(id)} }
        )

        // realiza a transaction de exclusão
        const [deposito, aluno] = await prisma.$transaction([
            prisma.deposito.delete({ where: { id: Number(id)} }),
            prisma.aluno.update({
              data: { saldo: { decrement: depositoExcluido?.valor }},
              where: { id: depositoExcluido?.alunoId }
           })
        ])

        res.status(200).json({deposito, aluno})
    } catch (error) {
        res.status(500).json({ erro: error })
    }
})

export default router