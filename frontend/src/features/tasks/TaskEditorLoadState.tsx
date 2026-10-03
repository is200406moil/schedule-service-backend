type Props = { kind: "loading" | "missing" | "error"; returnTo: string; onRetry: () => void };

export function TaskEditorLoadState({ kind, returnTo, onRetry }: Props) {
  if (kind === "loading") {
    return <div className="task-editor-loading" role="status" aria-label="Загружаем задачу"><span /><span /><span /></div>;
  }

  return (
    <div className="task-editor-load-error" role="alert">
      <h2>{kind === "missing" ? "Задача не найдена" : "Не удалось загрузить задачу"}</h2>
      <p>{kind === "missing" ? "Возможно, её удалили или у вас нет к ней доступа." : "Проверьте соединение и попробуйте ещё раз."}</p>
      <div>
        <a href={returnTo}>Вернуться</a>
        {kind === "error" ? <button type="button" onClick={onRetry}>Повторить</button> : null}
      </div>
    </div>
  );
}
