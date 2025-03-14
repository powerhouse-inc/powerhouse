import { Button, mergeClassNameProps } from "#powerhouse";
import { useState } from "react";

export type CookieInput = {
  id: string;
  label: string;
  value: boolean;
};

export interface CookieBannerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSubmit"> {
  cookies: CookieInput[];
  submitLabel?: string;
  rejectLabel?: string;
  onSubmit?: (cookies: CookieInput[]) => void;
  onReject?: () => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = (props) => {
  const {
    children,
    cookies,
    submitLabel,
    rejectLabel,
    onSubmit = () => {},
    onReject = () => {},
    ...divProps
  } = props;

  const [cookiesValue, setCookiesValue] = useState(cookies);

  const handleOnChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { id, checked } = event.target;

    setCookiesValue((prevState) =>
      prevState.map((cookie) =>
        cookie.id === id ? { ...cookie, value: checked } : cookie,
      ),
    );
  };

  const buttonStyles = "min-w-64 h-8 text-base";

  return (
    <div {...mergeClassNameProps(divProps, "flex flex-col items-center")}>
      <div className="text-center">{children}</div>
      <div className="my-8 flex gap-x-16 text-sm font-medium">
        {cookiesValue.map((cookie) => (
          <div className="cursor-pointer" key={cookie.id}>
            <input
              checked={cookie.value}
              className="mr-1 size-3 cursor-pointer rounded-sm border-2 border-gray-900 accent-gray-900 focus:outline-none"
              id={cookie.id}
              onChange={handleOnChange}
              type="checkbox"
            />
            <label className="cursor-pointer select-none" htmlFor={cookie.id}>
              {cookie.label}
            </label>
          </div>
        ))}
      </div>
      <div className="flex gap-x-8">
        <Button
          className={buttonStyles}
          color="light"
          onClick={() => onReject()}
          size="small"
        >
          {rejectLabel}
        </Button>
        <Button
          className={buttonStyles}
          onClick={() => onSubmit(cookiesValue)}
          size="small"
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
};
