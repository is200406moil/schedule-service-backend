import { useEffect, useRef } from "react";

function errorMessage(error: string, registration: boolean): string {
  switch (error) {
    case "auth": return "Проверьте почту и пароль.";
    case "rate": return "Слишком много попыток. Подождите несколько минут и попробуйте снова.";
    case "email": return "Введите корректный адрес электронной почты.";
    case "password": return registration ? "Пароль должен содержать от 8 до 128 символов." : "Введите пароль длиной от 1 до 128 символов.";
    case "exists": return "Аккаунт с такой почтой уже существует.";
    case "csrf": return registration ? "Страница устарела. Попробуйте зарегистрироваться ещё раз." : "Страница устарела. Попробуйте войти ещё раз.";
    case "date": return "Проверьте дату рождения.";
    case "avatar": return "Не получилось загрузить фото. Допустимы JPEG, PNG и WebP до 2 МБ.";
    default: return "Проверьте введённые данные и попробуйте ещё раз.";
  }
}

type Props = { error: string | null; ok: string | null; registration: boolean };

export function AuthFeedback({ error, ok, registration }: Props) {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <>
      {ok === "registered" ? <div className="form-notice notice-success" role="status">Аккаунт создан. Войдите с той же почтой и паролем.</div> : null}
      {ok === "password-reset" ? <div className="form-notice notice-success" role="status">Пароль изменён. Войдите с новым паролем.</div> : null}
      {ok === "email-verified" ? <div className="form-notice notice-success" role="status">Почта подтверждена. Войдите с вашей почтой и паролем.</div> : null}
      {error ? <div ref={errorRef} id="auth-error" className="form-notice notice-error" role="alert" tabIndex={-1}>
        {errorMessage(error, registration)}{error === "exists" ? <> <a href="/ui/login">Войти</a></> : null}
      </div> : null}
    </>
  );
}
