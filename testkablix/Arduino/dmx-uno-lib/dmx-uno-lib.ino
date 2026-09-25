#include <DmxSimple.h>

void setup()
{

    DmxSimple.usePin(3);     // Broche de donnée DMX
    DmxSimple.maxChannel(4); // Nombre de canaux utilisés
}
void loop()
{
    DmxSimple.write(1, 255);
    DmxSimple.write(2, 0);
    DmxSimple.write(3, 0);
    DmxSimple.write(4, 189);
    delay(1000);
    DmxSimple.write(1, 0);
    DmxSimple.write(2, 255);
    DmxSimple.write(3, 255);
    DmxSimple.write(4, 189);
    delay(1000);
    DmxSimple.write(1, 0);
    DmxSimple.write(2, 255);
    DmxSimple.write(3, 255);
    DmxSimple.write(4, 50);
    delay(1000);
    DmxSimple.write(1, 0);
    DmxSimple.write(2, 0);
    DmxSimple.write(3, 255);
    DmxSimple.write(4, 200);
    delay(10000);
}
