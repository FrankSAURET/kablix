/* Place le programme RP2040 en SRAM pour exécution directe par rp2040js. */
MEMORY
{
  RAM (rwx) : ORIGIN = 0x20000000, LENGTH = 264K
}

SECTIONS
{
  .vectors : { KEEP(*(.vectors)) } > RAM
  .text    : { *(.text*) *(.rodata*) } > RAM
  .data    : { *(.data*) } > RAM
  .bss     : { *(.bss*) *(COMMON) } > RAM
}
