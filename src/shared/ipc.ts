// Nomes de canais IPC — únicos, compartilhados entre preload e main.

export const IPC = {
  chatGetHistory: 'chat:getHistory',
  chatSend: 'chat:send',
  chatStreamChunk: 'chat:streamChunk',
  chatStreamDone: 'chat:streamDone',
  chatStreamError: 'chat:streamError',
  chatClear: 'chat:clear',
  chatPickAttachments: 'chat:pickAttachments',

  chatListConversations: 'chat:listConversations',
  chatCreateConversation: 'chat:createConversation',
  chatRenameConversation: 'chat:renameConversation',
  chatDeleteConversation: 'chat:deleteConversation',

  promptsGet: 'prompts:get',
  promptsSet: 'prompts:set',
  promptsUndo: 'prompts:undo',
  promptsRun: 'prompts:run',

  promptSuggestionApply: 'promptSuggestion:apply',
  promptSuggestionIgnore: 'promptSuggestion:ignore',

  pautasList: 'pautas:list',
  pautasMarkPublicada: 'pautas:markPublicada',

  dadosList: 'dados:list',
  dadosImport: 'dados:import',
  dadosDelete: 'dados:delete',
  dadosDeleteMany: 'dados:deleteMany',
  dadosClearAll: 'dados:clearAll',
  dadosUpdate: 'dados:update',
  dadosSetTexto: 'dados:setTexto',
  dadosAttachImage: 'dados:attachImage',
  dadosRemoveImage: 'dados:removeImage',
  dadosClassify: 'dados:classify',
  dadosPatternsSummary: 'dados:patternsSummary',

  settingsGet: 'settings:get',
  settingsSetActiveProvider: 'settings:setActiveProvider',
  settingsSetModel: 'settings:setModel',
  settingsSetApiKey: 'settings:setApiKey',
  settingsClearApiKey: 'settings:clearApiKey'
} as const
