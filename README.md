# Ótica Gadelhas — Pupilômetro Remoto

**Versão:** protótipo de demonstração, 24 de outubro de 2026.

Aplicativo web mobile-first para registrar uma **estimativa preliminar** de distância pupilar binocular (DP) por fotografia. É possível fazer foto na câmera ou carregar da galeria, detectar os centros das íris com MediaPipe Face Landmarker (quando há conexão), marcar manualmente os extremos da borda longa de um cartão padrão (85,60 mm), corrigir todos os pontos, calcular a distância e compartilhar imagem anotada e relatório.

## Arquivos

- `index.html`: interface e instruções ao cliente.
- `styles.css`: aparência responsiva.
- `app.js`: câmera, estimativa, marcações e compartilhamento.

## Como experimentar

**No computador:** abra `index.html` no navegador e use uma foto da galeria. Se o navegador bloquear recursos externos, rode em um servidor local (por exemplo `python -m http.server 8000`) e acesse `http://localhost:8000`. Para acessar a câmera fora de localhost, é obrigatório HTTPS.

**Para enviar um link aos clientes:** hospede os 3 arquivos em um serviço de sites estáticos com HTTPS, por exemplo, GitHub Pages, Cloudflare Pages ou Netlify. A hospedagem não está incluída neste pacote; antes de publicar, valide o funcionamento no celular e as exigências de privacidade da ótica.

Passo a passo simples no GitHub Pages:

1. Crie um repositório público **se concordar em tornar o código público**.
2. Envie `index.html`, `styles.css` e `app.js` para a raiz do repositório.
3. Em *Settings → Pages*, habilite a publicação a partir de `main` / `(root)`.
4. Use a URL HTTPS gerada pelo GitHub Pages para compartilhar com clientes.

Não há número fixo de WhatsApp vinculado; o botão compartilha pelo menu do celular ou abre o WhatsApp com o texto para que o cliente escolha o contato.

## Observações essenciais de segurança e precisão

- **NÃO É um pupilômetro clínico validado.** A geometria da câmera, profundidade do cartão, iluminação, ângulo de cabeça, movimento, convergência e precisão da localização da íris geram erros. Não usar diretamente para fabricar lentes nem anunciar precisão em milímetros sem validação experimental comparando muitas medições com um pupilômetro adequado.
- A referência de 85,60 mm vale para a **borda longa** de cartões no formato ID-1. Verifique que o cartão não está deformado e esteja próximo do plano dos olhos (a testa é uma aproximação imperfeita).
- Selfies produzem convergência para perto; uma foto assistida a 1,5–2 m reduz, mas não elimina, a diferença para DP de longe. Não converter uma na outra automaticamente.
- A estimativa de DP **monocular não é gerada**, nem alturas de montagem, ajuste de armação, centragem de lentes progressivas.
- O aplicativo não solicita nem armazena a foto em servidor. O navegador baixa bibliotecas e modelo de IA de domínios externos. Os dados da foto são processados localmente; só são compartilhados por iniciativa do cliente. Segundo o aviso de privacidade do MediaPipe, a biblioteca pode enviar métricas de desempenho/uso à Google sem enviar as fotos; esse tratamento deve estar refletido na política de privacidade da ótica.
- Fotos do rosto são dados pessoais e podem envolver dados biométricos. Em uso comercial no Brasil, planeje a conformidade com a LGPD: avaliação da base legal, política de privacidade, consentimento/aviso apropriado e processo seguro de recebimento, acesso, retenção e exclusão de fotos enviadas à ótica.
- O cartão **nunca deve exibir números bancários**. Use preferencialmente um cartão de plástico em branco com as mesmas dimensões, ou cubra todos os dados.
- O MediaPipe é servido pela CDN `cdn.jsdelivr.net`, e o modelo é obtido de `storage.googleapis.com` quando há internet. Se o download falhar, é possível marcar as pupilas manualmente.

## Tecnologias

HTML, CSS e JavaScript sem necessidade de backend. MediaPipe Tasks Vision (`@mediapipe/tasks-vision@0.10.22`, carregado sob demanda) usa o modelo oficial Face Landmarker e os centros de íris nos índices 468 e 473. Referência: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js

## Antes de colocar em produção

Testar diversos celulares, câmera traseira e frontal, fotografias assistidas, luz, cartões, transmissão via WhatsApp; executar estudo de erro em relação ao pupilômetro utilizado pela ótica; ajustar tolerância de erro e decidir quando rejeitar a foto. Validar segurança e LGPD com responsável profissional.
