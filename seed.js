/* Dados iniciais (usados só quando o arquivo dados.json ainda não existe no repositório privado).
   Fechamento/vencimento reais dos cartões. As contas da planilha entram aqui em SEED.contas. */
window.SEED={
  cards:[
    {id:'nu',n:'Nubank',close:1,due:8},
    {id:'cc',n:'Credicard',close:1,due:8},
    {id:'xp',n:'XPi',close:3,due:10},
    {id:'am',n:'Amazon',close:25,due:10},
    {id:'ml',n:'Mercado Livre',close:5,due:10}
  ],
  contas:[],
  meses:{}
};
