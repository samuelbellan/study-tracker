# Study Tracker Real-Time 🚀

O **Study Tracker** é um aplicativo de desktop focado na produtividade de grupos de amigos. Ele permite que todos de um grupo compartilhem o seu status de estudo em tempo real. Sempre que um usuário iniciar seu cronômetro de foco, todos os amigos conectados receberão uma notificação instantânea (toast).

## 📦 Arquitetura do Projeto

O projeto é dividido em duas partes principais:
1. **Frontend (App Desktop)**: Criado com React, Vite e encapsulado como um aplicativo instalável de Windows usando o Electron.
2. **Backend (Servidor)**: Um servidor Node.js simples usando Express e Socket.IO para gerenciar as salas e conexões em tempo real (WebSockets).

---

## 👥 Como Usar (Para o Usuário Final)

Se você recebeu o executável do administrador e quer se conectar:

1. Dê um duplo clique no arquivo `Study Tracker Setup 0.0.0.exe` e conclua a instalação padrão.
2. Abra o aplicativo instalado pela sua área de trabalho.
3. Digite o seu **Nome de Usuário** e clique em "Enter".
4. Você encontrará a lista atualizada de amigos que estão online no mesmo servidor.
5. Quando for iniciar a sua sessão de foco, clique em **"Start Studying"**. Todos os seus amigos online receberão um alerta informando do seu foco!
6. Quando concluir os estudos, clique em **"Stop Studying"**. O cronômetro vai parar e seu status vai voltar para "Idle" para todo mundo.

---

## 🛠️ Guia do Administrador / Desenvolvimento

Se você é o desenvolvedor ou o responsável pelo servidor do projeto, siga os guias abaixo.

### ⚙️ Pré-requisitos
- Ter o [Node.js](https://nodejs.org/) instalado.

### 1️⃣ Rodando o Ambiente de Desenvolvimento Local

Para alterar o programa e ver as atualizações em tempo real no seu PC:

**Terminal 1: Iniciar o Backend**
```bash
cd backend
npm install
npm start
```
*(O servidor Node rodará na porta `localhost:3000`)*

**Terminal 2: Compilar o Frontend (Vite)**
```bash
cd frontend
npm install
npm run dev
```

**Terminal 3: Iniciar a Janela do App (Electron)**
```bash
cd frontend
npm run electron:start
```

---

### 2️⃣ Gerando o Instalador (.exe)

Para que outras pessoas possam instalar e usar o aplicativo em suas máquinas, é necessário compilar o que chamamos de instalador.

1. Dentro do terminal na pasta do frontend, execute o comando de "build":
   ```bash
   cd frontend
   npm run electron:build
   ```
2. Após o processo de 1~2 minutos, acesse a pasta gerada:
   `frontend/dist-electron/`
3. O instalador gerado se chamará `Study Tracker Setup 0.0.0.exe`. Envie esse arquivo aos seus colegas!

---

### 3️⃣ Configuração de Rede e Servidor (O MAIS IMPORTANTE)

Para que você consiga usar o **Study Tracker** em computadores em redes Wi-Fi ou casas diferentes, o aplicativo precisa se conectar não ao seu `localhost`, mas sim a um **Servidor Público na Internet**.

Você tem duas formas de fazer isso como o administrador da rede:

#### Método A: Túnel Público (Fácil e Direto, mas requer que seu PC fique ligado)
O "Local tunneling" transforma rapidamente o servidor do seu PC num servidor acessível na web.

1. Inicie o servidor do backend normalmente: `npm start` (na pasta backend).
2. Em um novo terminal na pasta backend, instale o túnel globalmente: `npm install -g localtunnel`
3. Peça a criação do link apontando para a porta 3000 do seu PC:
   ```bash
   lt --port 3000 --subdomain algum-nome-personalizado
   ```
4. Ele devolverá uma URL como `https://algum-nome-personalizado.loca.lt`.
5. Abra o arquivo `frontend/src/App.jsx` e mude o link da variável `SOCKET_URL` para o que você acabou de gerar.
6. Faça novamente o passo **2️⃣** (Gerar o instalador) e envie o instalador para o pessoal.

> **Importante:** Se você desligar o seu computador ou fechar a janela preta rodando esse comando "lt", o instalador de todos os seus amigos vai perder a conexão offline.

#### Método B: Hospedagem 24/7 na Nuvem (Recomendado)
Use caso queira que as pessoas possam usar mesmo enquanto o seu computador administrador estiver desligado.

1. Salve apenas arquivos na pasta `backend` dentro de um repositório do **GitHub**.
2. Crie uma conta no **[Render.com](https://render.com)**.
3. Vá em "New" > "Web Service" > Conecte ao seu GitHub para enviar o backend.
4. Confirme se as configurações são o *build command* `npm install` e o *start command* `npm start`.
5. O Render te dará um link como `https://api-study-tracker.onrender.com`.
6. Abra o arquivo `frontend/src/App.jsx` na sua máquina e atualize o `SOCKET_URL` com esse link do Render!
7. Finalmente, compile todo o front end seguindo o passo **2️⃣** (`npm run electron:build`) para gerar o executável 24/7. Envie a todos.
