// Le bundle minifié n'embarque pas de types : on réutilise ceux de plotly.js.
declare module "plotly.js-dist-min" {
  import * as Plotly from "plotly.js";
  export = Plotly;
}
