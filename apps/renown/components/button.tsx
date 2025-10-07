export interface ButtonProps
    extends React.DetailedHTMLProps<
            React.ButtonHTMLAttributes<HTMLButtonElement>,
            HTMLButtonElement
        >,
        React.AriaAttributes {
    primary?: boolean;
    secondary?: boolean;
}

const Button: React.FC<ButtonProps> = ({
    className,
    primary,
    secondary,
    ...props
}) => {
    return (
        <button
            className={`${
                primary
                    ? "bg-action text-white hover:bg-action/75"
                    : secondary
                    ? "bg-neutral-2 text-neutral-4 hover:bg-neutral-4/10"
                    : ""
            } 
            font-semibold disabled:opacity-60 disabled:pointer-events-none
            transition-colors rounded-md p-2 ${className}`}
            {...props}
        />
    );
};

export default Button;
