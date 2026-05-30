import { useCallback, useEffect } from "react";

import type { Dispatch } from "react";

import { useTauriEvent } from "@/features/app/hooks/useTauriEvent";

import type { ThreadAction } from "@/features/threads/hooks/useThreadsReducer";

import {

  subscribeChatAgentAwaitingUser,

  subscribeChatAgentFinished,

} from "@/services/events";

import {

  hydrateChatAgentThreadHistory,

  mirrorChatAgentAwaitingUser,

  mirrorChatAgentFinished,

} from "../chatAgentThreadMirror";

import { readChatAgentStore } from "../state";

import type {

  ChatAgentAwaitingUserEvent,

  ChatAgentFinishedEvent,

} from "../types";



type UseChatAgentThreadMirrorOptions = {

  activeThreadId: string | null;

  dispatch: Dispatch<ThreadAction>;

};



export function useChatAgentThreadMirror({

  activeThreadId,

  dispatch,

}: UseChatAgentThreadMirrorOptions) {

  useEffect(() => {

    if (!activeThreadId) {

      return;

    }

    hydrateChatAgentThreadHistory(dispatch, activeThreadId);

  }, [activeThreadId, dispatch]);



  const resolveThreadId = useCallback((runId: string) => {

    return readChatAgentStore().runs[runId]?.threadId ?? null;

  }, []);



  const onAwaitingUser = useCallback(

    (event: ChatAgentAwaitingUserEvent) => {

      const threadId = resolveThreadId(event.runId);

      if (!threadId) {

        return;

      }

      mirrorChatAgentAwaitingUser(dispatch, event, threadId);

    },

    [dispatch, resolveThreadId],

  );



  const onFinished = useCallback(

    (event: ChatAgentFinishedEvent) => {

      const threadId = resolveThreadId(event.runId);

      if (!threadId) {

        return;

      }

      mirrorChatAgentFinished(dispatch, event, threadId);

    },

    [dispatch, resolveThreadId],

  );



  useTauriEvent(subscribeChatAgentAwaitingUser, onAwaitingUser);

  useTauriEvent(subscribeChatAgentFinished, onFinished);

}


