-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `recuperaExpira` DATETIME(3) NULL,
    ADD COLUMN `recuperaSenha` VARCHAR(4) NULL;
