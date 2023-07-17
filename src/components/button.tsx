const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
    className,
    ...props
}) => {
    return (
        <button
            className={`rounded-md bg-accent-5/20 px-4 py-[6px] text-accent-5 shadow-button hover:bg-accent-3 hover:shadow-none ${className}`}
            {...props}
        />
    );
};

export default Button;
