# Projeto: Análise de Atrasos (ANAC VRA)

## Estrutura
```
data/
  Dataset/       
  outputs/    
  public/   
  server.js    
  package.json
  tools/preaggregate.js
```

## Como rodar
1. Instale dependências:
   ```bash
   cd data
   npm install
   ```

2. Coloque os arquivos CSV da ANAC (VRA, 36 meses consecutivos) em `Dataset/`.  
   Adicione também `airport-codes.csv`.

3. Gere as agregações:
   ```bash
   npm run build:preagg
   ```

4. Rode o servidor e abra o dashboard:
   ```bash
   npm start
   # http://localhost:3000
   ```

## Métricas
- Aeroporto com mais atrasos (geral)  
- Aeroporto que aumentou/diminuiu atrasos  
- Tendência de atrasos no período  
- Dias da semana com mais atrasos (por ano)  
- Período do dia com mais atrasos (por ano)  
- Companhia que mais atrasa (por ano)  

**Critério de atraso:** chegada (ou partida, se falta chegada) ≥ 15 minutos, ou status “ATRASADO”.
