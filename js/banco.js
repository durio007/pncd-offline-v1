
/* ==========================================
   PNCD V9 OFFLINE - CMB-SOFT
   Banco de dados local - IndexedDB
   ========================================== */

const NOME_BANCO = "PNCD_OFFLINE_CMB_SOFT";
const VERSAO_BANCO = 2;

function abrirBanco() {
    return new Promise((resolve, reject) => {

        const requisicao = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

        // Criar estrutura na primeira abertura
        requisicao.onupgradeneeded = (evento) => {

            const banco = evento.target.result;

            // Formulários FAD 01
            if (!banco.objectStoreNames.contains("formularios")) {

                const formularios = banco.createObjectStore(
                    "formularios",
                    { keyPath: "id" }
                );

                formularios.createIndex(
                    "agente_id",
                    "agente_id",
                    { unique: false }
                );

                formularios.createIndex(
                    "status",
                    "status",
                    { unique: false }
                );
            }

            // Imóveis registrados nos formulários
            if (!banco.objectStoreNames.contains("imoveis")) {

                const imoveis = banco.createObjectStore(
                    "imoveis",
                    { keyPath: "id" }
                );

                imoveis.createIndex(
                    "formulario_id",
                    "formulario_id",
                    { unique: false }
                );
            }

            // Histórico de alterações
            if (!banco.objectStoreNames.contains("auditoria")) {

                const auditoria = banco.createObjectStore(
                    "auditoria",
                    { keyPath: "id" }
                );

                auditoria.createIndex(
                    "formulario_id",
                    "formulario_id",
                    { unique: false }
                );
            }
                                // Usuários do sistema PNCD Offline
                if (!banco.objectStoreNames.contains("usuarios")) {

                    const usuarios = banco.createObjectStore(
                        "usuarios",
                        { keyPath: "id" }
                    );

                    usuarios.createIndex(
                        "usuario",
                        "usuario",
                        { unique: true }
                    );

                    usuarios.createIndex(
                        "perfil",
                        "perfil",
                        { unique: false }
                    );

                    usuarios.createIndex(
                        "supervisor_id",
                        "supervisor_id",
                        { unique: false }
                    );
                }
            // Informações de sincronização
            if (!banco.objectStoreNames.contains("sincronizacao")) {

                banco.createObjectStore(
                    "sincronizacao",
                    { keyPath: "id" }
                );
            }
        };

        requisicao.onsuccess = (evento) => {

            const banco = evento.target.result;

            console.log(
                "PNCD Offline: banco de dados aberto.",
                banco.name
            );

            resolve(banco);
        };

        requisicao.onerror = () => {

            console.error(
                "Erro ao abrir banco PNCD Offline:",
                requisicao.error
            );

            reject(requisicao.error);
        };

        requisicao.onblocked = () => {
            console.warn(
                "Atualização do banco bloqueada por outra aba."
            );
        };
    });
}
/* ==========================================
   SALVAR FORMULÁRIO FAD 01
   ========================================== */
async function salvarFormulario(formulario) {

    const banco = await abrirBanco();

    return new Promise((resolve, reject) => {

        const transacao = banco.transaction(
            "formularios",
            "readwrite"
        );

        const tabela = transacao.objectStore("formularios");

        // Identificação única do formulário
        if (!formulario.id) {
            formulario.id = crypto.randomUUID();
        }

        // Verificar o registro existente na mesma transação
        const consulta = tabela.get(formulario.id);

        consulta.onsuccess = () => {

            const existente = consulta.result;

            // Impedir alterações em formulários concluídos
            if (
                existente &&
                existente.status !== "rascunho"
            ) {
                transacao.abort();
                return;
            }

            // Evitar alteração do status por esta função
            if (
                existente &&
                formulario.status !== "rascunho"
            ) {
                transacao.abort();
                return;
            }

            // Novos formulários começam como rascunho
            if (!existente) {
                formulario.status = "rascunho";
            }

            formulario.atualizado_em =
                new Date().toISOString();

            tabela.put(formulario);
        };

        consulta.onerror = () => {
            transacao.abort();
        };

        transacao.oncomplete = () => {
            banco.close();
            resolve(formulario.id);
        };

        transacao.onerror = () => {
            const erro = transacao.error;
            banco.close();
            reject(erro);
        };

        transacao.onabort = () => {
            const erro = transacao.error ||
                new Error(
                    "Operação bloqueada: formulário não editável."
                );

            banco.close();
            reject(erro);
        };
    });
}
// PNCD OFFLINE - FINALIZAR FORMULÁRIO FAD 01
async function finalizarFormularioPNCD(formularioId) {

    const sessaoTexto = sessionStorage.getItem(
        "pncd_usuario_logado"
    );

    if (!sessaoTexto) {
        throw new Error("Usuário não autenticado.");
    }

    let usuario;

    try {
        usuario = JSON.parse(sessaoTexto);
    } catch {
        throw new Error("Sessão inválida.");
    }

    if (
        !usuario ||
        usuario.perfil !== "agente" ||
        !usuario.id
    ) {
        throw new Error(
            "Somente o agente responsável pode finalizar."
        );
    }

    const banco = await abrirBanco();

    return new Promise((resolve, reject) => {

        const transacao = banco.transaction(
            "formularios",
            "readwrite"
        );

        const tabela = transacao.objectStore("formularios");
        const consulta = tabela.get(formularioId);

        let formularioFinalizado = null;

        consulta.onsuccess = () => {

            const formulario = consulta.result;

            if (!formulario) {
                transacao.abort();
                return;
            }

            if (
                String(formulario.agente_id) !==
                String(usuario.id)
            ) {
                transacao.abort();
                return;
            }

            if (formulario.status !== "rascunho") {
                transacao.abort();
                return;
            }

                // VALIDAR CICLO/ANO, DATA E ATIVIDADE NO INDEXEDDB
                    if (
                        !/^[0-9]{2}\/[0-9]{4}$/.test(
                            String(formulario.ciclo_ano || "").trim()
                        ) ||
                        !String(formulario.data_atividade || "").trim() ||
                        !["1", "2", "3", "4", "5", "6"].includes(
                            String(formulario.atividade || "")
                        )
                    ) {
                        transacao.abort();
                        return;
                    }

            formulario.status = "finalizado";
            formulario.finalizado_em =
                new Date().toISOString();

            formulario.atualizado_em =
                formulario.finalizado_em;

            formularioFinalizado = formulario;

            tabela.put(formulario);
        };

        consulta.onerror = () => transacao.abort();

        transacao.oncomplete = () => {
            banco.close();
            resolve(formularioFinalizado);
        };

        transacao.onerror = () => {
            const erro = transacao.error;
            banco.close();
            reject(erro);
        };

        transacao.onabort = () => {
            banco.close();
            reject(
                new Error(                 
                "Finalização bloqueada. Verifique o agente responsável, " +
                "o status do formulário, o Ciclo/Ano (NN/AAAA), " +
                "a data da atividade e a atividade selecionada."
                )
            );
        };
    });
}

// ETAPA 177.9.63.5
// Reabertura autorizada de FAD 01 finalizado

async function reabrirFormularioFinalizadoPNCD(formularioId, motivo) {

    const sessaoTexto = sessionStorage.getItem("pncd_usuario_logado");

    if (!sessaoTexto) {
        throw new Error("Usuário não autenticado.");
    }

    let usuario;

    try {
        usuario = JSON.parse(sessaoTexto);
    } catch {
        throw new Error("Sessão inválida.");
    }

    if (
        !usuario ||
        !usuario.id ||
        !["administrador", "supervisor"].includes(usuario.perfil)
    ) {
        throw new Error(
            "Somente administrador ou supervisor pode reabrir um FAD 01."
        );
    }

    motivo = String(motivo || "").trim();

    if (!motivo) {
        throw new Error("Informe o motivo da reabertura.");
    }

    if (!formularioId) {
        throw new Error("Identificação do formulário não informada.");
    }

    const banco = await abrirBanco();

    return new Promise((resolve, reject) => {

        const transacao = banco.transaction(
            ["formularios", "auditoria"],
            "readwrite"
        );

        const tabela = transacao.objectStore("formularios");
        const auditoria = transacao.objectStore("auditoria");
        const consulta = tabela.get(formularioId);

        let formularioReaberto = null;
        let erroValidacao = null;

        consulta.onsuccess = () => {

            const formulario = consulta.result;

            if (!formulario) {
                erroValidacao = "Formulário não encontrado.";
                transacao.abort();
                return;
            }

            if (formulario.status !== "finalizado") {
                erroValidacao =
                    "Somente formulários finalizados podem ser reabertos.";
                transacao.abort();
                return;
            }

            const agora = new Date().toISOString();

            formulario.status = "rascunho";
            formulario.atualizado_em = agora;

            formulario.reaberto_em = agora;
            formulario.reaberto_por = usuario.id;
            formulario.motivo_reabertura = motivo;

            formularioReaberto = formulario;

            tabela.put(formulario);

            auditoria.add({
                id: crypto.randomUUID(),
                formulario_id: formularioId,
                acao: "REABERTURA_FAD01",
                usuario_id: usuario.id,
                usuario_perfil: usuario.perfil,
                data_hora: agora,
                motivo: motivo
            });
        };

        consulta.onerror = () => {
            erroValidacao = "Erro ao consultar o formulário.";
            transacao.abort();
        };

        transacao.oncomplete = () => {
            banco.close();
            resolve(formularioReaberto);
        };

        transacao.onabort = () => {
            banco.close();
            reject(new Error(
                erroValidacao ||
                "Não foi possível reabrir o formulário."
            ));
        };

        transacao.onerror = () => {
            // O erro será tratado pelo evento onabort.
        };
    });
}

/* ==========================================
   CONSULTAR FORMULÁRIOS SALVOS
   PNCD V9 OFFLINE - CMB-SOFT
   ========================================== */

async function listarFormularios(agenteId) {

    const banco = await abrirBanco();

    return new Promise((resolve, reject) => {

        const transacao = banco.transaction(
            "formularios",
            "readonly"
        );

        const tabela = transacao.objectStore("formularios");

        // Consultar somente os registros do agente informado
        const indice = tabela.index("agente_id");

        const requisicao = indice.getAll(agenteId);

        requisicao.onsuccess = () => {

            const formularios = requisicao.result;

            formularios.sort((a, b) => {
                return (b.atualizado_em || "")
                    .localeCompare(a.atualizado_em || "");
            });

            resolve(formularios);
        };

        requisicao.onerror = () => {
            reject(requisicao.error);
        };

        transacao.oncomplete = () => {
            banco.close();
        };

        transacao.onabort = () => {
            banco.close();
        };
    });
}
// PNCD OFFLINE - CONSULTAR TODOS OS FORMULÁRIOS
async function listarTodosFormularios() {

    const dadosSessao = sessionStorage.getItem(
        "pncd_usuario_logado"
    );

    if (!dadosSessao) {
        throw new Error("Usuário não autenticado.");
    }

    const usuario = JSON.parse(dadosSessao);

    if (usuario.perfil !== "administrador") {
        throw new Error("Acesso permitido somente ao administrador.");
    }

    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                "formularios",
                "readonly"
            );

            const requisicao = transacao
                .objectStore("formularios")
                .getAll();

            requisicao.onsuccess = () => {

                const formularios = requisicao.result || [];

                formularios.sort((a, b) =>
                    (b.atualizado_em || "").localeCompare(
                        a.atualizado_em || ""
                    )
                );

                resolve(formularios);
            };

            requisicao.onerror = () => {
                reject(requisicao.error);
            };
        });

    } finally {
        banco.close();
    }
}

async function listarFormulariosSupervisorPNCD() {
    const dadosSessao = sessionStorage.getItem("pncd_usuario_logado");

    if (!dadosSessao) {
        throw new Error("Usuário não autenticado.");
    }

    const usuario = JSON.parse(dadosSessao);

    if (usuario.perfil !== "supervisor" || !usuario.id) {
        throw new Error("Acesso permitido somente ao supervisor.");
    }

    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {
            const tx = banco.transaction(
                ["usuarios", "formularios"],
                "readonly"
            );

            const reqUsuarios = tx.objectStore("usuarios").getAll();
            const reqFormularios = tx.objectStore("formularios").getAll();

            let usuarios = [];
            let formularios = [];

            reqUsuarios.onsuccess = () => {
                usuarios = reqUsuarios.result || [];
            };

            reqFormularios.onsuccess = () => {
                formularios = reqFormularios.result || [];
            };

            tx.oncomplete = () => {
                const agentesVinculados = new Set(
                    usuarios
                        .filter(u =>
                            u.perfil === "agente" &&
                            String(u.supervisor_id) === String(usuario.id)
                        )
                        .map(u => String(u.id))
                );

                const resultado = formularios
                    .filter(f =>
                        agentesVinculados.has(String(f.agente_id))
                    )
                    .sort((a, b) =>
                        (b.atualizado_em || "").localeCompare(
                            a.atualizado_em || ""
                        )
                    );

                resolve(resultado);
            };

            tx.onerror = () => {
                reject(tx.error || new Error(
                    "Erro ao consultar formulários do supervisor."
                ));
            };

            tx.onabort = () => {
                reject(tx.error || new Error(
                    "Consulta cancelada."
                ));
            };
        });
    } finally {
        banco.close();
    }
}


/* ==========================================
   BUSCAR FORMULÁRIO PELO ID
   PNCD V9 OFFLINE - CMB-SOFT
   ========================================== */

async function buscarFormulario(formularioId) {

    const banco = await abrirBanco();

    return new Promise((resolve, reject) => {

        const transacao = banco.transaction(
            "formularios",
            "readonly"
        );

        const tabela = transacao.objectStore("formularios");

        const requisicao = tabela.get(formularioId);

        requisicao.onsuccess = () => {
            resolve(requisicao.result || null);
        };

        requisicao.onerror = () => {
            reject(requisicao.error);
        };

        transacao.oncomplete = () => {
            banco.close();
        };

        transacao.onabort = () => {
            banco.close();
            reject(
                transacao.error ||
                new Error("Consulta interrompida.")
            );
        };
    });
}

/* ==========================================
   REABRIR FORMULÁRIO EM RASCUNHO
   PNCD V9 OFFLINE - CMB-SOFT
   ========================================== */

async function reabrirRascunho(formularioId) {

    // Consultar o formulário no banco local
    const formulario = await buscarFormulario(formularioId);

    if (!formulario) {
        throw new Error(
            "Formulário não encontrado no banco local."
        );
    }

    // Somente rascunhos podem ser reabertos
    if (formulario.status !== "rascunho") {
        throw new Error(
            "Este formulário não está em rascunho."
        );
    }

    console.log(
        "PNCD Offline: rascunho recuperado.",
        formulario.id
    );

    return formulario;
}

async function atualizarRascunho(formularioId, alteracoes) {

    // Recupera o formulário armazenado
    const formulario = await reabrirRascunho(formularioId);

    // Permite alterar somente os campos autorizados


    
const camposPermitidos = [
    "municipio",
    "codigo_localidade",
    "localidade",
    "categoria",
    "zona",
    "tipo",
    "zona_concluida",
    "ciclo_ano",
    "data_atividade",
    "atividade"
];


    for (const campo of camposPermitidos) {

        if (Object.prototype.hasOwnProperty.call(
            alteracoes, campo
        )) {

            formulario[campo] = alteracoes[campo];
        }
    }

    // Mantém o formulário como rascunho
    formulario.status = "rascunho";

    // Salva as alterações no IndexedDB
    await salvarFormulario(formulario);

    console.log(
        "PNCD Offline: rascunho atualizado com sucesso.",
        formulario.id
    );

    return formulario;
}

async function salvarImovel(imovel) {

    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                ["formularios", "imoveis"],
                "readwrite"
            );

            const tabelaFormularios =
                transacao.objectStore("formularios");

            const tabelaImoveis =
                transacao.objectStore("imoveis");

            let erroBloqueio = null;

            // Consultar o formulário vinculado ao imóvel
            const consultaFormulario =
                tabelaFormularios.get(imovel.formulario_id);

            consultaFormulario.onsuccess = () => {

                const formulario =
                    consultaFormulario.result;

                // Permitir gravação somente em rascunhos
                if (
                    !formulario ||
                    formulario.status !== "rascunho"
                ) {
                    erroBloqueio = new Error(
                        "Salvamento bloqueado: o formulário " +
                        "não existe ou não está em rascunho."
                    );

                    transacao.abort();
                    return;
                }

                // Verificar se o imóvel já existe
                const consultaImovel =
                    tabelaImoveis.get(imovel.id);

                consultaImovel.onsuccess = () => {

                    const imovelExistente =
                        consultaImovel.result;

                    // Impedir transferência de imóvel
                    // entre formulários
                    if (
                        imovelExistente &&
                        String(imovelExistente.formulario_id) !==
                        String(imovel.formulario_id)
                    ) {
                        erroBloqueio = new Error(
                            "Salvamento bloqueado: o imóvel " +
                            "pertence a outro formulário."
                        );

                        transacao.abort();
                        return;
                    }

                    // Preservar identificadores e histórico
                    // quando o imóvel já existe
                    const imovelParaSalvar = imovelExistente
                        ? {
                            ...imovelExistente,
                            ...imovel,
                            id: imovelExistente.id,
                            formulario_id:
                                imovelExistente.formulario_id,
                            numero_ordem:
                                imovelExistente.numero_ordem,
                            criado_em:
                                imovelExistente.criado_em,
                            excluido:
                                imovelExistente.excluido,
                            excluido_em:
                                imovelExistente.excluido_em
                        }
                        : { ...imovel };

                    tabelaImoveis.put(imovelParaSalvar);
                };
            };

            transacao.oncomplete = () => {

                console.log(
                    "PNCD Offline: imóvel salvo com sucesso.",
                    imovel.id
                );

                resolve(imovel);
            };

            transacao.onabort = () => {
                reject(
                    erroBloqueio ||
                    transacao.error ||
                    new Error(
                        "Não foi possível salvar o imóvel."
                    )
                );
            };

            transacao.onerror = () => {};
        });

    } finally {
        banco.close();
    }
}

async function atualizarImovel(imovelAtualizado) {
    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                ["formularios", "imoveis"],
                "readwrite"
            );

            const tabelaImoveis =
                transacao.objectStore("imoveis");

            const tabelaFormularios =
                transacao.objectStore("formularios");

            let imovelSalvo = null;
            let erroBloqueio = null;

            const consulta =
                tabelaImoveis.get(imovelAtualizado.id);

            consulta.onsuccess = () => {

                const imovelOriginal = consulta.result;

                if (!imovelOriginal) {
                    erroBloqueio = new Error(
                        "Imóvel não encontrado."
                    );
                    transacao.abort();
                    return;
                }

                // Impedir edição em outro formulário
                if (
                    String(imovelOriginal.formulario_id) !==
                    String(imovelAtualizado.formulario_id)
                ) {
                    erroBloqueio = new Error(
                        "Acesso negado. O imóvel pertence " +
                        "a outro formulário."
                    );
                    transacao.abort();
                    return;
                }
                    // ETAPA 177.9.16 - BLOQUEAR EDICAO DE IMOVEIS NA LIXEIRA

                    if (imovelOriginal.excluido === true) {
                        erroBloqueio = new Error(
                            "Edição bloqueada. Este imóvel está na lixeira. " +
                            "Restaure o imóvel antes de realizar alterações."
                        );

                        transacao.abort();
                        return;
                    }
                // Consultar o formulário na mesma transação
                const consultaFormulario =
                    tabelaFormularios.get(
                        imovelOriginal.formulario_id
                    );

                consultaFormulario.onsuccess = () => {

                    const formulario =
                        consultaFormulario.result;

                    // Permitir edição somente em rascunhos
                    if (
                        !formulario ||
                        formulario.status !== "rascunho"
                    ) {
                        erroBloqueio = new Error(
                            "Edição bloqueada: o formulário " +
                            "não está em rascunho."
                        );
                        transacao.abort();
                        return;
                    }

                    // ETAPA 177.9.22 - VALIDAR AGENTE PROPRIETARIO

                        let usuarioLogado;

                        try {
                            usuarioLogado = JSON.parse(
                                sessionStorage.getItem("pncd_usuario_logado")
                            );
                        } catch {
                            usuarioLogado = null;
                        }

                        if (
                            !usuarioLogado ||
                            !usuarioLogado.id ||
                            usuarioLogado.perfil !== "agente" ||
                            String(formulario.agente_id) !== String(usuarioLogado.id)
                        ) {
                            erroBloqueio = new Error(
                                "Acesso negado. O agente não possui " +
                                "permissão para editar este imóvel."
                            );

                            transacao.abort();
                            return;
                        }

                    imovelSalvo = {
                        ...imovelOriginal,
                        ...imovelAtualizado,

                        // Preservar dados originais
                        id: imovelOriginal.id,
                        formulario_id:
                            imovelOriginal.formulario_id,
                        numero_ordem:
                            imovelOriginal.numero_ordem,
                        criado_em:
                            imovelOriginal.criado_em
                    };

                    tabelaImoveis.put(imovelSalvo);
                };

            };

            consulta.onerror = () => {
                transacao.abort();
            };

            transacao.oncomplete = () => {
                resolve(imovelSalvo);
            };

            transacao.onabort = () => {
                reject(
                    erroBloqueio ||
                    transacao.error ||
                    new Error("Atualização cancelada.")
                );
            };
        });

    } finally {
        banco.close();
    }
}
async function enviarImovelParaLixeira(imovelId, formularioId) {
    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                ["formularios", "imoveis"],
                "readwrite"
            );

            const tabelaImoveis =
                transacao.objectStore("imoveis");

            const tabelaFormularios =
                transacao.objectStore("formularios");

            let imovelAtualizado = null;
            let erroBloqueio = null;

            const consulta = tabelaImoveis.get(imovelId);

            consulta.onsuccess = () => {

                const imovel = consulta.result;

                if (!imovel) {
                    erroBloqueio = new Error(
                        "Imóvel não encontrado."
                    );
                    transacao.abort();
                    return;
                }

                // Impedir alterações em outro formulário
                if (
                    String(imovel.formulario_id) !==
                    String(formularioId)
                ) {
                    erroBloqueio = new Error(
                        "O imóvel pertence a outro formulário."
                    );
                    transacao.abort();
                    return;
                }

                // Impedir exclusão repetida
                if (imovel.excluido === true) {
                    erroBloqueio = new Error(
                        "Este imóvel já está na lixeira."
                    );
                    transacao.abort();
                    return;
                }

                // Consultar o status do formulário
                const consultaFormulario =
                    tabelaFormularios.get(imovel.formulario_id);

                consultaFormulario.onsuccess = () => {

                    const formulario =
                        consultaFormulario.result;

                    if (
                        !formulario ||
                        formulario.status !== "rascunho"
                    ) {
                        erroBloqueio = new Error(
                            "Exclusão bloqueada: o formulário " +
                            "não está em rascunho."
                        );
                        transacao.abort();
                        return;
                    }
                        // ETAPA 177.9.29 - PROTEGER EXCLUSAO POR AGENTE

                            let usuarioLogado;

                            try {
                                usuarioLogado = JSON.parse(
                                    sessionStorage.getItem("pncd_usuario_logado")
                                );
                            } catch {
                                usuarioLogado = null;
                            }

                            if (
                                !usuarioLogado ||
                                !usuarioLogado.id ||
                                usuarioLogado.perfil !== "agente" ||
                                String(formulario.agente_id) !== String(usuarioLogado.id)
                            ) {
                                erroBloqueio = new Error(
                                    "Acesso negado. O agente não possui " +
                                    "permissão para excluir este imóvel."
                                );

                                transacao.abort();
                                return;
                            }
                    // Exclusão lógica: preservar o registro
                    imovelAtualizado = {
                        ...imovel,
                        excluido: true,
                        excluido_em: new Date().toISOString()
                    };

                    tabelaImoveis.put(imovelAtualizado);
                };
            };

            consulta.onerror = () => {
                transacao.abort();
            };

            transacao.oncomplete = () => {
                resolve(imovelAtualizado);
            };

            transacao.onabort = () => {
                reject(
                    erroBloqueio ||
                    transacao.error ||
                    new Error(
                        "Não foi possível enviar o imóvel para a lixeira."
                    )
                );
            };
        });

    } finally {
        banco.close();
    }
}

async function restaurarImovelDaLixeira(imovelId, formularioId) {

    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                ["formularios", "imoveis"],
                "readwrite"
            );

            const tabelaImoveis =
                transacao.objectStore("imoveis");

            const tabelaFormularios =
                transacao.objectStore("formularios");

            let imovelRestaurado = null;
            let erroBloqueio = null;

            const consulta = tabelaImoveis.get(imovelId);

            consulta.onsuccess = () => {

                const imovel = consulta.result;

                if (!imovel) {
                    erroBloqueio = new Error(
                        "Imóvel não encontrado."
                    );
                    transacao.abort();
                    return;
                }

                // Verificar se pertence ao formulário correto
                if (
                    String(imovel.formulario_id) !==
                    String(formularioId)
                ) {
                    erroBloqueio = new Error(
                        "O imóvel pertence a outro formulário."
                    );
                    transacao.abort();
                    return;
                }

                // Somente imóveis na lixeira podem ser restaurados
                if (imovel.excluido !== true) {
                    erroBloqueio = new Error(
                        "Este imóvel não está na lixeira."
                    );
                    transacao.abort();
                    return;
                }

                // Consultar o formulário na mesma transação
                const consultaFormulario =
                    tabelaFormularios.get(imovel.formulario_id);

                consultaFormulario.onsuccess = () => {

                    const formulario =
                        consultaFormulario.result;

                    // Bloquear restauração após conclusão
                    if (
                        !formulario ||
                        formulario.status !== "rascunho"
                    ) {
                        erroBloqueio = new Error(
                            "Restauração bloqueada: o formulário " +
                            "não está em rascunho."
                        );
                        transacao.abort();
                        return;
                    }
                        // ETAPA 177.9.26 - PROTEGER RESTAURACAO POR AGENTE

                            let usuarioLogado;

                            try {
                                usuarioLogado = JSON.parse(
                                    sessionStorage.getItem("pncd_usuario_logado")
                                );
                            } catch {
                                usuarioLogado = null;
                            }

                            if (
                                !usuarioLogado ||
                                !usuarioLogado.id ||
                                usuarioLogado.perfil !== "agente" ||
                                String(formulario.agente_id) !== String(usuarioLogado.id)
                            ) {
                                erroBloqueio = new Error(
                                    "Acesso negado. O agente não possui " +
                                    "permissão para restaurar este imóvel."
                                );

                                transacao.abort();
                                return;
                            }
                    // Restaurar preservando os dados originais
                    imovelRestaurado = {
                        ...imovel,
                        excluido: false,
                        excluido_em: null
                    };

                    tabelaImoveis.put(imovelRestaurado);
                };
            };

            consulta.onerror = () => {
                transacao.abort();
            };

            transacao.oncomplete = () => {
                resolve(imovelRestaurado);
            };

            transacao.onabort = () => {
                reject(
                    erroBloqueio ||
                    transacao.error ||
                    new Error(
                        "Não foi possível restaurar o imóvel."
                    )
                );
            };

        });

    } finally {
        banco.close();
    }
}

async function listarImoveisDaLixeira(formularioId) {

    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                "imoveis",
                "readonly"
            );

            const tabela = transacao.objectStore("imoveis");

            const indice = tabela.index("formulario_id");

            const requisicao = indice.getAll(formularioId);

            let imoveisExcluidos = [];

            requisicao.onsuccess = () => {

                const todosImoveis = requisicao.result || [];

                // Mostrar somente os imóveis enviados à lixeira.
                imoveisExcluidos = todosImoveis.filter(
                    imovel => imovel.excluido === true
                );

                // Manter a numeração original.
                imoveisExcluidos.sort(
                    (a, b) =>
                        (a.numero_ordem ?? 0) -
                        (b.numero_ordem ?? 0)
                );
            };

            requisicao.onerror = () => {
                transacao.abort();
            };

            transacao.oncomplete = () => {
                resolve(imoveisExcluidos);
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error(
                        "Não foi possível consultar a lixeira."
                    )
                );
            };

        });
    } finally {
        banco.close();
    }
}

async function salvarImovelComNumeroOrdem(imovel) {
    const banco = await abrirBanco();

    try {
        return await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                ["formularios", "imoveis"],
                "readwrite"
            );

            const tabelaFormularios =
                transacao.objectStore("formularios");

            const tabelaImoveis =
                transacao.objectStore("imoveis");

            const indice =
                tabelaImoveis.index("formulario_id");

            let imovelSalvo = null;
            let erroBloqueio = null;

            // Verificar se o imóvel pertence a um
            // formulário que ainda está em rascunho
            const consultaFormulario =
                tabelaFormularios.get(imovel.formulario_id);

            consultaFormulario.onsuccess = () => {

                const formulario = consultaFormulario.result;

                if (
                    !formulario ||
                    formulario.status !== "rascunho"
                ) {
                    erroBloqueio = new Error(
                        "Cadastro bloqueado: o formulário " +
                        "não existe ou não está em rascunho."
                    );

                    transacao.abort();
                    return;
                }

                // Consultar imóveis do formulário
                const consultaImoveis =
                    indice.getAll(imovel.formulario_id);

                consultaImoveis.onsuccess = () => {

                    const imoveisExistentes =
                        consultaImoveis.result;

                    let maiorNumero = 0;

                    for (const existente of imoveisExistentes) {
                        const numero = existente.numero_ordem;

                        if (
                            Number.isSafeInteger(numero) &&
                            numero > maiorNumero
                        ) {
                            maiorNumero = numero;
                        }
                    }

                    imovelSalvo = {
                        ...imovel,
                        numero_ordem: maiorNumero + 1
                    };

                    tabelaImoveis.add(imovelSalvo);
                };
            };

            transacao.oncomplete = () => {
                resolve(imovelSalvo);
            };

            transacao.onabort = () => {
                reject(
                    erroBloqueio ||
                    transacao.error ||
                    new Error("Cadastro cancelado.")
                );
            };

            transacao.onerror = () => {
                // O erro será tratado em onabort.
            };
        });

    } finally {
        banco.close();
    }
}

async function listarImoveis(formularioId) {

    const banco = await abrirBanco();

    return new Promise((resolve, reject) => {

        const transacao = banco.transaction(
            "imoveis",
            "readonly"
        );

        const tabela = transacao.objectStore("imoveis");

        const indice = tabela.index("formulario_id");

        const requisicao = indice.getAll(formularioId);

        requisicao.onsuccess = () => {

            const todosImoveis = requisicao.result || [];

            // Exibir somente imóveis que não estão na lixeira.
            // Registros antigos sem a propriedade "excluido"
            // continuam sendo considerados ativos.
            const imoveisAtivos = todosImoveis.filter(
            imovel => imovel.excluido !== true
            );

            // ORDENAR IMÓVEIS PELO NÚMERO DE ORDEM
            imoveisAtivos.sort((a, b) => {

            const ordemA =
                Number.isSafeInteger(a.numero_ordem) &&
                a.numero_ordem > 0
                    ? a.numero_ordem
                    : Number.MAX_SAFE_INTEGER;

            const ordemB =
                Number.isSafeInteger(b.numero_ordem) &&
                b.numero_ordem > 0
                    ? b.numero_ordem
                    : Number.MAX_SAFE_INTEGER;

            if (ordemA !== ordemB) {
                return ordemA - ordemB;
            }

            // Compatibilidade com registros antigos
            return String(a.criado_em || "").localeCompare(
                String(b.criado_em || "")
            );
        });

        resolve(imoveisAtivos);

        };

        requisicao.onerror = () => {
            reject(requisicao.error);
        };

        transacao.oncomplete = () => {
            banco.close();
        };

    });
}

async function gerarBackupCompletoPNCD() {

    const banco = await abrirBanco();

    const tabelas = [
    "formularios",
    "imoveis",
    "auditoria",
    "sincronizacao",
    "usuarios"
    ];

    try {

        const dados = await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                tabelas,
                "readonly"
            );

            const resultado = {};

            transacao.oncomplete = () => {
                resolve(resultado);
            };

            transacao.onerror = () => {
                reject(transacao.error);
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error("Transação de backup cancelada.")
                );
            };

            tabelas.forEach((nomeTabela) => {

                const requisicao = transacao
                    .objectStore(nomeTabela)
                    .getAll();

                requisicao.onsuccess = () => {
                    resultado[nomeTabela] =
                        requisicao.result || [];
                };

            });

        });

        const backup = {
            sistema: "PNCD V9 OFFLINE",
            empresa: "CMB-SOFT",
            tipo: "backup_completo",
            data_backup: new Date().toISOString(),
            versao_banco: banco.version,
            dados: dados
        };

        const conteudo = JSON.stringify(
            backup,
            null,
            2
        );

        const arquivo = new Blob(
            [conteudo],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(arquivo);

        const link = document.createElement("a");

        link.href = url;
        // PNCD OFFLINE - NOME AUTOMÁTICO DO BACKUP
const agora = new Date();

const dataHoraBackup =
    agora.getFullYear() + "-" +
    String(agora.getMonth() + 1).padStart(2, "0") + "-" +
    String(agora.getDate()).padStart(2, "0") + "_" +
    String(agora.getHours()).padStart(2, "0") + "-" +
    String(agora.getMinutes()).padStart(2, "0") + "-" +
    String(agora.getSeconds()).padStart(2, "0");

link.download = "PNCD_V9_OFFLINE_BACKUP_" + dataHoraBackup + ".json";

        document.body.appendChild(link);

        link.click();
        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

        console.log(
        "PNCD: backup completo gerado.",
    {
        formularios: dados.formularios.length,
        imoveis: dados.imoveis.length,
        auditoria: dados.auditoria.length,
        sincronizacao: dados.sincronizacao.length,
        usuarios: dados.usuarios.length
    }
    );

        return {
    formularios: dados.formularios.length,
    imoveis: dados.imoveis.length,
    auditoria: dados.auditoria.length,
    sincronizacao: dados.sincronizacao.length,
    usuarios: dados.usuarios.length
    };

    } finally {

        banco.close();

    }
}

    async function validarArquivoBackupPNCD(arquivo) {

        if (!arquivo) {
            throw new Error("Nenhum arquivo selecionado.");
        }

        if (!arquivo.name.toLowerCase().endsWith(".json")) {
            throw new Error("Selecione um arquivo JSON.");
        }

        // Limite de segurança: 50 MB
        if (arquivo.size > 50 * 1024 * 1024) {
            throw new Error("O arquivo excede 50 MB.");
        }

    const conteudo = await arquivo.text();

    let backup;

    try {
        backup = JSON.parse(conteudo);
    } catch (erro) {
        throw new Error("O arquivo não contém um JSON válido.");
    }

    if (
        !backup ||
        typeof backup !== "object" ||
        Array.isArray(backup)
    ) {
        throw new Error("Estrutura de backup inválida.");
    }

    if (
        backup.sistema !== "PNCD V9 OFFLINE" ||
        backup.tipo !== "backup_completo"
    ) {
        throw new Error("Arquivo não reconhecido como backup completo do PNCD.");
    }

    if (
        !backup.dados ||
        typeof backup.dados !== "object" ||
        Array.isArray(backup.dados)
    ) {
        throw new Error("Dados do backup não encontrados.");
    }

    const tabelas = [
    "formularios",
    "imoveis",
    "auditoria",
    "sincronizacao"
    ];

    if (Object.prototype.hasOwnProperty.call(backup.dados, "usuarios")) {
    tabelas.push("usuarios");
    }

    for (const tabela of tabelas) {

        if (!Array.isArray(backup.dados[tabela])) {
            throw new Error(
                "Tabela ausente ou inválida: " + tabela
            );
        }

        const ids = new Set();

        for (const registro of backup.dados[tabela]) {

            if (
                !registro ||
                typeof registro !== "object" ||
                Array.isArray(registro) ||
                !Object.prototype.hasOwnProperty.call(
                    registro,
                    "id"
                ) ||
                registro.id === null ||
                registro.id === undefined
            ) {
                throw new Error(
                    "Registro inválido na tabela: " + tabela
                );
            }

            const identificador = JSON.stringify(registro.id);

            if (ids.has(identificador)) {
                throw new Error(
                    "ID duplicado na tabela: " + tabela
                );
            }

            ids.add(identificador);
        }
    }

    const resumo = {
    sistema: backup.sistema,
    data_backup: backup.data_backup,
    versao_banco: backup.versao_banco,
    formularios: backup.dados.formularios.length,
    imoveis: backup.dados.imoveis.length,
    auditoria: backup.dados.auditoria.length,
    sincronizacao: backup.dados.sincronizacao.length,
    usuarios: Array.isArray(backup.dados.usuarios)
        ? backup.dados.usuarios.length
        : 0
    };

    console.log(
        "PNCD: arquivo de backup validado.",
        resumo
    );

    return resumo;
    }

        async function abrirBancoTesteRestauracaoPNCD() {

        // Banco separado do IndexedDB original.
        const NOME_BANCO_TESTE =
            "PNCD_OFFLINE_TESTE_RESTAURACAO_V2";

        const VERSAO_BANCO_TESTE = 2;

        return new Promise((resolve, reject) => {

            const requisicao = indexedDB.open(NOME_BANCO_TESTE, VERSAO_BANCO_TESTE);

            requisicao.onupgradeneeded = (evento) => {

                const banco = evento.target.result;

                // Estrutura independente para testes.
                    const tabelas = [
                        "formularios",
                        "imoveis",
                        "auditoria",
                        "sincronizacao",
                        "usuarios"
                    ];

                tabelas.forEach((nomeTabela) => {

                    if (!banco.objectStoreNames.contains(nomeTabela)) {

                        const tabela = banco.createObjectStore(
                            nomeTabela,
                            { keyPath: "id" }
                        );

                        if (nomeTabela === "formularios") {

                            tabela.createIndex(
                                "agente_id",
                                "agente_id",
                                { unique: false }
                            );

                            tabela.createIndex(
                                "status",
                                "status",
                                { unique: false }
                            );
                        }

                        if (nomeTabela === "imoveis") {

                            tabela.createIndex(
                                "formulario_id",
                                "formulario_id",
                                { unique: false }
                            );
                        }

                        if (nomeTabela === "auditoria") {
                            tabela.createIndex(
                                "formulario_id",
                                "formulario_id",
                                { unique: false }
                            );
                        }
                        if (nomeTabela === "usuarios") {

                        tabela.createIndex(
                            "usuario",
                            "usuario",
                            { unique: true }
                        );

                        tabela.createIndex(
                            "perfil",
                            "perfil",
                            { unique: false }
                        );

                        tabela.createIndex(
                            "supervisor_id",
                            "supervisor_id",
                            { unique: false }
                        );
                    }
                }
            });
        };

        requisicao.onsuccess = (evento) => {

            const banco = evento.target.result;

            // Impedir exclusão acidental do banco original.
            if (banco.name !== NOME_BANCO_TESTE) {

                banco.close();

                reject(
                    new Error("Nome inesperado do banco de testes.")
                );

                return;
            }

            console.log(
                "PNCD: banco isolado de restauração aberto:",
                banco.name
            );

            resolve(banco);
        };

        requisicao.onerror = () => {

            reject(
                requisicao.error ||
                new Error("Erro ao abrir banco de testes.")
            );
        };

        requisicao.onblocked = () => {

            console.warn(
                "PNCD: abertura do banco de testes bloqueada."
                    );
                };
            });
        }

        async function importarBackupNoBancoTestePNCD(arquivo) {

            // Validar o arquivo antes de qualquer gravação.
            const resumo = await validarArquivoBackupPNCD(arquivo);

            const conteudo = await arquivo.text();
            const backup = JSON.parse(conteudo);

            const tabelas = [
            "formularios",
            "imoveis",
            "auditoria",
            "sincronizacao"
        ];

        // Incluir usuários somente se existirem no backup
        if (Array.isArray(backup.dados.usuarios)) {
            tabelas.push("usuarios");
        }

        const nomeEsperado =
            "PNCD_OFFLINE_TESTE_RESTAURACAO_V2";

            const banco = await abrirBancoTesteRestauracaoPNCD();

            try {

                if (banco.name !== nomeEsperado) {
                    throw new Error(
                        "Operação bloqueada: banco de destino incorreto."
                    );
                }

                const versoesPermitidas = [1, 2];

                    if (
                        !versoesPermitidas.includes(backup.versao_banco) ||
                        banco.version !== 2
                    ) {
                        throw new Error(
                            "Versão do backup ou do banco de testes incompatível."
                        );
                    }

                // Verificar se o banco de testes está vazio.
                const contagens = await new Promise((resolve, reject) => {

                    const transacao = banco.transaction(
                        tabelas,
                        "readonly"
                    );

                    const resultado = {};

                    tabelas.forEach((nomeTabela) => {

                        const requisicao = transacao
                            .objectStore(nomeTabela)
                            .count();

                        requisicao.onsuccess = () => {
                            resultado[nomeTabela] = requisicao.result;
                        };

                    });

                    transacao.oncomplete = () => resolve(resultado);

                    transacao.onerror = () => reject(transacao.error);

                    transacao.onabort = () => reject(
                        transacao.error ||
                        new Error("Verificação cancelada.")
                    );

                });

                const possuiRegistros = tabelas.some(
                    nomeTabela => contagens[nomeTabela] !== 0
                );

                if (possuiRegistros) {
                    throw new Error(
                        "Importação bloqueada: o banco de testes não está vazio."
                    );
                }

                // Importar todas as tabelas em uma única transação.
                await new Promise((resolve, reject) => {

                    const transacao = banco.transaction(
                        tabelas,
                        "readwrite"
                    );

                    transacao.oncomplete = () => resolve();

                    transacao.onerror = () => reject(
                        transacao.error ||
                        new Error("Erro durante a importação.")
                    );

                    transacao.onabort = () => reject(
                        transacao.error ||
                        new Error("Importação cancelada.")
                    );

                    tabelas.forEach((nomeTabela) => {

                        const tabela = transacao.objectStore(
                            nomeTabela
                        );

                        backup.dados[nomeTabela].forEach((registro) => {

                            tabela.add(registro);

                        });

                    });

                });

                console.log(
                    "PNCD: backup importado no banco de testes.",
                    resumo
                );

                return resumo;

            } finally {

                banco.close();

            }
        }


// =====================================================
// PNCD OFFLINE - PROTEÇÃO DE SENHAS
// =====================================================

async function gerarHashSenhaPNCD(senha) {

    if (typeof senha !== "string" || senha.length < 8) {
        throw new Error(
            "A senha deve possuir pelo menos 8 caracteres."
        );
    }

    if (!crypto?.subtle || !crypto?.getRandomValues) {
        throw new Error(
            "Criptografia indisponível neste navegador."
        );
    }

    const salt = crypto.getRandomValues(
        new Uint8Array(16)
    );

    const codificador = new TextEncoder();

    const chave = await crypto.subtle.importKey(
        "raw",
        codificador.encode(senha),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const iteracoes = 600000;

    const resultado = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: iteracoes,
            hash: "SHA-256"
        },
        chave,
        256
    );

    const paraHex = bytes =>
        Array.from(bytes)
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");

    return {
        algoritmo: "PBKDF2-SHA256",
        iteracoes: iteracoes,
        salt: paraHex(salt),
        hash: paraHex(new Uint8Array(resultado))
    };
}


// =====================================================
// PNCD OFFLINE - VERIFICAÇÃO DE SENHAS
// =====================================================

async function verificarSenhaPNCD(senha, dadosSenha) {

    if (
        typeof senha !== "string" ||
        !dadosSenha ||
        dadosSenha.algoritmo !== "PBKDF2-SHA256" ||
        !Number.isInteger(dadosSenha.iteracoes) ||
        dadosSenha.iteracoes < 100000 ||
        dadosSenha.iteracoes > 2000000 ||
        !/^[0-9a-f]{32}$/i.test(dadosSenha.salt) ||
        !/^[0-9a-f]{64}$/i.test(dadosSenha.hash)
    ) {
        return false;
    }

    const deHex = texto =>
        new Uint8Array(
            texto.match(/.{2}/g).map(
                parte => parseInt(parte, 16)
            )
        );

    const chave = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(senha),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const resultado = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: deHex(dadosSenha.salt),
            iterations: dadosSenha.iteracoes,
            hash: "SHA-256"
        },
        chave,
        256
    );

    const hashCalculado = new Uint8Array(resultado);
    const hashArmazenado = deHex(dadosSenha.hash);

    let diferenca = 0;

    for (let i = 0; i < hashCalculado.length; i++) {
        diferenca |= hashCalculado[i] ^ hashArmazenado[i];
    }

    return diferenca === 0;
}


// =====================================================
// PNCD OFFLINE - CADASTRO DO PRIMEIRO ADMINISTRADOR
// =====================================================

async function cadastrarPrimeiroAdministradorPNCD(dados) {

    const nome = String(dados?.nome || "").trim();
    const matricula = String(dados?.matricula || "").trim();
    const usuario = String(dados?.usuario || "")
        .trim()
        .toLowerCase();
    const senha = dados?.senha;

    if (!nome || !matricula || !usuario) {
        throw new Error(
            "Informe nome completo, matrícula e usuário."
        );
    }

    if (!/^[a-z0-9._-]{4,40}$/.test(usuario)) {
        throw new Error(
            "O usuário deve ter de 4 a 40 caracteres, " +
            "utilizando letras, números, ponto, hífen ou underline."
        );
    }

    if (typeof senha !== "string" || senha.length < 12) {
        throw new Error(
            "A senha deve possuir pelo menos 12 caracteres."
        );
    }

    const banco = await abrirBanco();

    try {
        if (!banco.objectStoreNames.contains("usuarios")) {
            throw new Error("Tabela de usuários não encontrada.");
        }

        // Verificação inicial antes de calcular o hash.
        const quantidade = await new Promise((resolve, reject) => {
            const transacao = banco.transaction(
                "usuarios",
                "readonly"
            );

            const pedido = transacao
                .objectStore("usuarios")
                .count();

            pedido.onsuccess = () => resolve(pedido.result);
            pedido.onerror = () => reject(pedido.error);
        });

        if (quantidade !== 0) {
            throw new Error(
                "Cadastro inicial bloqueado: já existem usuários."
            );
        }

        const dadosSenha = await gerarHashSenhaPNCD(senha);

        const novoAdministrador = {
            id: crypto.randomUUID(),
            nome: nome,
            matricula: matricula,
            usuario: usuario,
            perfil: "administrador",
            supervisor_id: null,
            senha: dadosSenha,
            ativo: true,
            criado_em: new Date().toISOString()
        };

        // A conferência definitiva ocorre na mesma transação
        // utilizada para gravar o administrador.
        await new Promise((resolve, reject) => {

            const transacao = banco.transaction(
                "usuarios",
                "readwrite"
            );

            const tabela = transacao.objectStore("usuarios");
            const verificacao = tabela.count();

            verificacao.onsuccess = () => {
                if (verificacao.result !== 0) {
                    transacao.abort();
                    return;
                }

                tabela.add(novoAdministrador);
            };

            verificacao.onerror = () => {
                transacao.abort();
            };

            transacao.oncomplete = () => resolve();

            transacao.onerror = () => reject(
                transacao.error ||
                new Error("Erro ao cadastrar administrador.")
            );

            transacao.onabort = () => reject(
                new Error(
                    "Cadastro bloqueado ou transação cancelada."
                )
            );
        });

        return {
            id: novoAdministrador.id,
            nome: novoAdministrador.nome,
            matricula: novoAdministrador.matricula,
            usuario: novoAdministrador.usuario,
            perfil: novoAdministrador.perfil
        };

    } finally {
        banco.close();
    }
}
// PNCD OFFLINE V1.0 - VERIFICAR PRIMEIRO ACESSO
async function verificarPrimeiroAcessoPNCD() {

    const banco = await abrirBanco();

    try {
        if (!banco.objectStoreNames.contains("usuarios")) {
            throw new Error(
                "Tabela de usuários não encontrada."
            );
        }

        return await new Promise((resolve, reject) => {

            const tx = banco.transaction(
                "usuarios",
                "readonly"
            );

            const pedido = tx.objectStore("usuarios").count();

            let quantidade = null;

            pedido.onsuccess = () => {
                quantidade = pedido.result;
            };

            tx.oncomplete = () => {
                resolve(quantidade === 0);
            };

            tx.onerror = () => {
                reject(
                    tx.error ||
                    new Error("Erro ao verificar primeiro acesso.")
                );
            };

            tx.onabort = () => {
                reject(
                    tx.error ||
                    new Error("Verificação cancelada.")
                );
            };
        });

    } finally {
        banco.close();
    }
}
// =====================================================
// PNCD OFFLINE - AUTENTICAÇÃO DE USUÁRIOS
// =====================================================

async function autenticarUsuarioPNCD(usuario, senha) {

    const login = String(usuario || "")
        .trim()
        .toLowerCase();

    if (!login || typeof senha !== "string" || !senha) {
        throw new Error("Informe usuário e senha.");
    }

    const banco = await abrirBanco();

    let usuarioEncontrado;

    try {
        usuarioEncontrado = await new Promise(
            (resolve, reject) => {

                const transacao = banco.transaction(
                    "usuarios",
                    "readonly"
                );

                const tabela = transacao.objectStore("usuarios");
                const indice = tabela.index("usuario");
                const pedido = indice.get(login);

                pedido.onsuccess = () => resolve(pedido.result);
                pedido.onerror = () => reject(pedido.error);
            }
        );

    } finally {
        banco.close();
    }

    if (!usuarioEncontrado || usuarioEncontrado.ativo !== true) {
        throw new Error("Usuário ou senha inválidos.");
    }

    const senhaValida = await verificarSenhaPNCD(
        senha,
        usuarioEncontrado.senha
    );

    if (!senhaValida) {
        throw new Error("Usuário ou senha inválidos.");
    }

    return {
        id: usuarioEncontrado.id,
        nome: usuarioEncontrado.nome,
        matricula: usuarioEncontrado.matricula,
        usuario: usuarioEncontrado.usuario,
        perfil: usuarioEncontrado.perfil,
        supervisor_id: usuarioEncontrado.supervisor_id,
        ativo: usuarioEncontrado.ativo
    };
}

// =====================================================
// PNCD OFFLINE - VERIFICAR LOGIN EXISTENTE
// =====================================================

async function verificarLoginExistentePNCD(login) {

    const nomeUsuario = String(login || "").trim();

    if (!nomeUsuario) {
        return false;
    }

    const banco = await abrirBanco();

    return new Promise((resolve, reject) => {

        const transacao = banco.transaction(
            ["usuarios"],
            "readonly"
        );

        const usuarios = transacao.objectStore("usuarios");

        const indice = usuarios.index("usuario");

        const consulta = indice.get(nomeUsuario);

        consulta.onsuccess = () => {
            resolve(Boolean(consulta.result));
        };

        consulta.onerror = () => {
            reject(
                consulta.error ||
                new Error("Erro ao consultar usuário.")
            );
        };

    });
}

// =====================================================
// PNCD OFFLINE - ADMINISTRAÇÃO LOCAL DE USUÁRIOS
// Aviso: autenticação exclusivamente no navegador não oferece
// isolamento contra alguém com acesso ao DevTools/IndexedDB.
// =====================================================

function sessaoAdministradorPNCD() {
    let sessao;
    try { sessao = JSON.parse(sessionStorage.getItem('pncd_usuario_logado') || 'null'); }
    catch (_) { throw new Error('Sessão inválida. Entre novamente.'); }
    if (!sessao || sessao.perfil !== 'administrador' || !sessao.id || !sessao.usuario) {
        throw new Error('Acesso restrito ao administrador.');
    }
    return sessao;
}

async function confirmarAdministradorPNCD(senhaAdministrador) {
    const sessao = sessaoAdministradorPNCD();
    if (!senhaAdministrador) throw new Error('Informe sua senha de administrador para confirmar.');
    const confirmado = await autenticarUsuarioPNCD(sessao.usuario, senhaAdministrador);
    if (confirmado.id !== sessao.id || confirmado.perfil !== 'administrador' || confirmado.ativo !== true) {
        throw new Error('Administrador não confirmado.');
    }
    return confirmado;
}

// =====================================================
// PNCD OFFLINE - CONSULTAR SUPERVISOR VINCULADO AO AGENTE
// =====================================================

async function consultarSupervisorDoAgentePNCD() {

    const sessao = JSON.parse(
        sessionStorage.getItem("pncd_usuario_logado") || "null"
    );

    if (!sessao || sessao.perfil !== "agente" || !sessao.id) {
        throw new Error("Consulta restrita ao agente.");
    }

    const banco = await abrirBanco();

    try {

        return await new Promise((resolve, reject) => {

            const tx = banco.transaction("usuarios", "readonly");
            const tabela = tx.objectStore("usuarios");

            let resultado = null;

            const consultaAgente = tabela.get(sessao.id);

            consultaAgente.onsuccess = () => {

                const agente = consultaAgente.result;

                if (
                    !agente ||
                    agente.perfil !== "agente" ||
                    agente.ativo !== true
                ) {
                    tx.abort();
                    return;
                }

                if (!agente.supervisor_id) {
                    return;
                }

                const consultaSupervisor = tabela.get(
                    agente.supervisor_id
                );

                consultaSupervisor.onsuccess = () => {

                    const supervisor = consultaSupervisor.result;

                    if (
                        supervisor &&
                        supervisor.perfil === "supervisor" &&
                        supervisor.ativo === true
                    ) {
                        resultado = {
                            id: supervisor.id,
                            nome: supervisor.nome
                        };
                    }

                };

            };

            tx.oncomplete = () => resolve(resultado);

            tx.onerror = () => reject(
                tx.error || new Error("Falha ao consultar supervisor.")
            );

            tx.onabort = () => reject(
                new Error("Consulta do supervisor cancelada.")
            );

        });

    } finally {

        banco.close();

    }

}

async function listarUsuariosAdministracaoPNCD() {
    sessaoAdministradorPNCD();
    const banco = await abrirBanco();
    try {
        return await new Promise((resolve, reject) => {
            const tx = banco.transaction('usuarios', 'readonly');
            const req = tx.objectStore('usuarios').getAll();
            let resultado = [];
            req.onsuccess = () => {
                resultado = (req.result || []).map(u => ({
                    id: u.id, nome: u.nome, matricula: u.matricula,
                    usuario: u.usuario, perfil: u.perfil,
                    supervisor_id: u.supervisor_id ?? null,
                    ativo: u.ativo === true, criado_em: u.criado_em
                })).sort((a,b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
            };
            tx.oncomplete = () => resolve(resultado);
            tx.onerror = () => reject(tx.error || new Error('Falha ao listar usuários.'));
            tx.onabort = () => reject(tx.error || new Error('Consulta cancelada.'));
        });
    } finally { banco.close(); }
}

async function cadastrarUsuarioAdministracaoPNCD(dados, senhaAdministrador) {
    await confirmarAdministradorPNCD(senhaAdministrador);
    const nome = String(dados?.nome || '').trim();
    const matricula = String(dados?.matricula || '').trim();
    const usuario = String(dados?.usuario || '').trim().toLowerCase();
    const perfil = dados?.perfil;
    const senha = dados?.senha;
    const supervisor_id = dados?.supervisor_id || null;
    if (nome.length < 3 || nome.length > 150) throw new Error('Nome: 3 a 150 caracteres.');
    if (!matricula || matricula.length > 30) throw new Error('Matrícula obrigatória, até 30 caracteres.');
    if (!['supervisor','agente'].includes(perfil)) throw new Error('Selecione Supervisor ou Agente.');
    if (!/^[a-z0-9._-]{4,30}$/.test(usuario)) throw new Error('Login: 4 a 30 caracteres; letras minúsculas, números, ponto, hífen ou underline.');
    if (typeof senha !== 'string' || senha.length < 12) throw new Error('A senha deve ter pelo menos 12 caracteres.');
    if (perfil !== 'agente' && supervisor_id) throw new Error('Somente agentes podem ter supervisor associado.');

    // Calcula o hash antes da transação para evitar seu encerramento por await.
    const senhaProtegida = await gerarHashSenhaPNCD(senha);
    const banco = await abrirBanco();
    try {
        return await new Promise((resolve, reject) => {
            const tx = banco.transaction('usuarios', 'readwrite');
            const store = tx.objectStore('usuarios');
            const registro = {
                id: crypto.randomUUID(), nome, matricula, usuario, perfil,
                supervisor_id: perfil === 'agente' ? supervisor_id : null,
                senha: senhaProtegida, ativo: true,
                criado_em: new Date().toISOString()
            };
            let motivo = null;
            if (supervisor_id) {
                const consulta = store.get(supervisor_id);
                consulta.onsuccess = () => {
                    const supervisor = consulta.result;
                    if (!supervisor || supervisor.perfil !== 'supervisor' || supervisor.ativo !== true) {
                        motivo = 'Supervisor inválido ou inativo.';
                        tx.abort();
                    } else {
                        store.add(registro);
                    }
                };
            } else {
                store.add(registro);
            }
            tx.oncomplete = () => resolve({
                id: registro.id, nome, matricula, usuario, perfil,
                supervisor_id: registro.supervisor_id, ativo: true
            });
            tx.onerror = () => reject(tx.error?.name === 'ConstraintError'
                ? new Error('Este login já está cadastrado.')
                : tx.error || new Error('Falha ao cadastrar usuário.'));
            tx.onabort = () => reject(new Error(motivo || (tx.error?.name === 'ConstraintError'
                ? 'Este login já está cadastrado.' : 'Cadastro cancelado.')));
        });
    } finally { banco.close(); }
}

async function alterarStatusUsuarioAdministracaoPNCD(id, novoStatus, senhaAdministrador) {
    const admin = await confirmarAdministradorPNCD(senhaAdministrador);
    if (typeof novoStatus !== 'boolean') throw new Error('Status inválido.');
    if (id === admin.id) throw new Error('Não é permitido alterar seu próprio administrador.');
    const banco = await abrirBanco();
    try {
        return await new Promise((resolve, reject) => {
            const tx = banco.transaction('usuarios', 'readwrite');
            const store = tx.objectStore('usuarios');
            let motivo = null;
            const req = store.get(id);
            req.onsuccess = () => {
                const registro = req.result;
                if (!registro || registro.perfil === 'administrador') {
                    motivo = 'Usuário inexistente ou administrador protegido.';
                    tx.abort(); return;
                }
                store.put({...registro, ativo: novoStatus, atualizado_em: new Date().toISOString()});
            };
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Falha ao alterar status.'));
            tx.onabort = () => reject(new Error(motivo || 'Alteração cancelada.'));
        });
    } finally { banco.close(); }
}


// PNCD OFFLINE - EDICAO DE USUARIOS (preserva senha, ID e registros)
async function editarUsuarioAdministracaoPNCD(id, alteracoes, senhaAdministrador) {
    const admin = await confirmarAdministradorPNCD(senhaAdministrador);
    const nome = String(alteracoes?.nome || '').trim();
    const matricula = String(alteracoes?.matricula || '').trim();
    const usuario = String(alteracoes?.usuario || '').trim().toLowerCase();
    const perfil = alteracoes?.perfil;
    const supervisor_id = perfil === 'agente' ? (alteracoes?.supervisor_id || null) : null;
    if (!id || id === admin.id) throw new Error('Administrador protegido contra edicao.');
    if (nome.length < 3 || nome.length > 150) throw new Error('Nome: 3 a 150 caracteres.');
    if (!matricula || matricula.length > 30) throw new Error('Matricula obrigatoria, ate 30 caracteres.');
    if (!['supervisor', 'agente'].includes(perfil)) throw new Error('Perfil invalido.');
    if (!/^[a-z0-9._-]{4,30}$/.test(usuario)) throw new Error('Login invalido: 4 a 30 caracteres permitidos.');
    if (supervisor_id === id) throw new Error('Usuario nao pode ser seu proprio supervisor.');
    const banco = await abrirBanco();
    try {
        return await new Promise((resolve, reject) => {
            const tx = banco.transaction('usuarios', 'readwrite');
            const store = tx.objectStore('usuarios');
            let motivo = null;
            let salvo = null;
            const cancelar = texto => { motivo = texto; tx.abort(); };
            const pedido = store.get(id);
            pedido.onsuccess = () => {
                const original = pedido.result;
                if (!original || original.perfil === 'administrador') {
                    cancelar('Usuario nao encontrado ou administrador protegido.'); return;
                }
                const verificarVinculos = () => {
                    // Nao transformar supervisor que ainda possui agentes vinculados.
                    if (original.perfil === 'supervisor' && perfil !== 'supervisor') {
                        const reqAgentes = store.index('supervisor_id').getAll(id);
                        reqAgentes.onsuccess = () => {
                            if ((reqAgentes.result || []).some(u => u.id !== id && u.perfil === 'agente')) {
                                cancelar('Este supervisor possui agentes vinculados. Reatribua-os antes de alterar seu perfil.');
                            } else gravar();
                        };
                    } else gravar();
                };
                const gravar = () => {
                    salvo = {
                        ...original, nome, matricula, usuario, perfil, supervisor_id,
                        atualizado_em: new Date().toISOString()
                    };
                    store.put(salvo);
                };
                if (supervisor_id) {
                    const reqSupervisor = store.get(supervisor_id);
                    reqSupervisor.onsuccess = () => {
                        const s = reqSupervisor.result;
                        if (!s || s.perfil !== 'supervisor' || s.ativo !== true) {
                            cancelar('Supervisor invalido ou inativo.'); return;
                        }
                        verificarVinculos();
                    };
                } else verificarVinculos();
            };
            tx.oncomplete = () => resolve({
                id: salvo.id, nome: salvo.nome, matricula: salvo.matricula,
                usuario: salvo.usuario, perfil: salvo.perfil,
                supervisor_id: salvo.supervisor_id, ativo: salvo.ativo
            });
            
            tx.onerror = () => {
                 if (tx.error?.name === 'ConstraintError') {
                      motivo = 'Este login ja esta cadastrado.';
             }
        };
            tx.onabort = () => {
                const mensagem = motivo ||
                    (tx.error?.name === 'ConstraintError'
                        ? 'Este login ja esta cadastrado.'
                            : tx.error?.message || 'Edicao cancelada.');
                reject(new Error(mensagem));
            };
        });
    } finally { banco.close(); }
}
