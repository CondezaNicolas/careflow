"use client";

import type { FormEventHandler } from "react";
import { useState } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { ArrowRight, Eye, EyeOff, HeartPulse, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

import type { LoginInput } from "@/features/auth/auth.types";

interface LoginFormProps {
  authError: string | null;
  isSubmitting: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<LoginInput>;
  errors: FieldErrors<LoginInput>;
}

export function LoginForm({ authError, isSubmitting, onSubmit, register, errors }: LoginFormProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <form className="login-form" onSubmit={onSubmit} noValidate>
      <div className="login-brand">
        <span className="login-brand-mark" aria-hidden="true">
          <HeartPulse size={20} strokeWidth={2.2} />
        </span>
        <span className="login-brand-copy">CareFlow</span>
      </div>

      <div className="login-form-copy">
        <h1>Acceso CareFlow</h1>
        <p>Inicia sesion para acceder a tu portal de salud o gestion clinica.</p>
      </div>

      <div className="login-field">
        <label className="login-field-label" htmlFor="email">
          Correo Electronico
        </label>
        <span className="login-field-control">
          <span className="login-field-icon" aria-hidden="true">
            <Mail size={18} strokeWidth={2} />
          </span>
          <input
            aria-invalid={errors.email?.message ? true : false}
            autoComplete="email"
            inputMode="email"
            id="email"
            placeholder="nombre@careflow.com"
            {...register("email")}
          />
        </span>
        {errors.email?.message ? <em>{errors.email.message}</em> : null}
      </div>

      <div className="login-field">
        <span className="login-field-label-row">
          <label className="login-field-label" htmlFor="password">
            Contrasena
          </label>
          <button className="login-field-link" type="button">
            Olvidaste tu contrasena?
          </button>
        </span>
        <span className="login-field-control">
          <span className="login-field-icon" aria-hidden="true">
            <LockKeyhole size={18} strokeWidth={2} />
          </span>
          <input
            aria-invalid={errors.password?.message ? true : false}
            autoComplete="current-password"
            id="password"
            placeholder="............."
            type={isPasswordVisible ? "text" : "password"}
            {...register("password")}
          />
          <button
            aria-label={isPasswordVisible ? "Ocultar contrasena" : "Mostrar contrasena"}
            className="login-field-toggle"
            type="button"
            onClick={() => {
              setIsPasswordVisible((currentValue) => !currentValue);
            }}
          >
            {isPasswordVisible ? (
              <EyeOff size={18} strokeWidth={2} />
            ) : (
              <Eye size={18} strokeWidth={2} />
            )}
          </button>
        </span>
        {errors.password?.message ? <em>{errors.password.message}</em> : null}
      </div>

      <label className="login-remember-row">
        <input name="remember-me" type="checkbox" />
        <span>Mantener sesion iniciada</span>
      </label>

      {authError ? (
        <div className="login-error" role="alert">
          {authError}
        </div>
      ) : null}

      <button className="login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <>
            <LoaderCircle className="login-submit-spinner" size={18} strokeWidth={2.2} />
            Iniciando sesion...
          </>
        ) : (
          <>
            Iniciar Sesion
            <ArrowRight size={18} strokeWidth={2.2} />
          </>
        )}
      </button>
    </form>
  );
}
