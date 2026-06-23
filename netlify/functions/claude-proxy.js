// PROXY PARA LA API DE ANTHROPIC CLAUDE (Netlify Function)
// Evita el error de CORS al llamar a la API de Anthropic directamente desde el navegador.
//
// PASO MANUAL PARA LA USUARIA EN NETLIFY:
// 1. Ir a https://app.netlify.com
// 2. Abrir el sitio `cfo-marcela`
// 3. Ir a Site configuration -> Environment variables
// 4. Agregar la variable de entorno:
//    - Key: ANTHROPIC_API_KEY
//    - Value: Tu clave secreta (empieza con sk-ant-...)
// 5. Guardar y redesplegar el sitio.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: body.system,
        messages: body.messages
      })
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
