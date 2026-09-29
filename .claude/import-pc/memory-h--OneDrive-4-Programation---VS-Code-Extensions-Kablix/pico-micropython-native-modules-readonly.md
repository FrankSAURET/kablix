---
name: pico-micropython-native-modules-readonly
description: "Kablix Pico sim — patcher un module/type natif MicroPython passe par sys.modules, pas par réassignation"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 4b38e090-1ceb-485f-819d-a8a586e7cce3
---

Dans la simulation Pico (rp2040js + MicroPython) de Kablix, pour intercepter/patcher une API MicroPython native (ex. `machine.I2C`) depuis un préambule Python injecté :

- **Impossible** de sous-classer un type natif (`class X(machine.I2C)` → refus).
- **Impossible** de réassigner un attribut d'un module natif (`machine.I2C = ...` → refus, module en lecture seule).
- **Marche** : remplacer le module ENTIER dans `sys.modules` par un objet de substitution qui délègue au vrai via `__getattr__` et surcharge ce qu'il faut. C'est le pattern du pont réseau (`NET_PREAMBLE` dans [src/shared/pynet.ts] fait `sys.modules['network'] = ...`). Cf. `I2C_SCAN_SHIM` dans [src/compiler.ts].

**Pourquoi :** `from machine import I2C` lit `sys.modules['machine']` en premier → un substitut y est pris. Le préambule doit s'exécuter AVANT l'import du script.

**Bonus I²C :** l'émulation I²C de rp2040js **fige** sur toute transaction vers une adresse ABSENTE (le `bus.scan()` MicroPython sonde par écriture longueur nulle). Donc `scan()` ne doit PAS sonder : il renvoie les adresses connues de Kablix, injectées par le moteur ([src/webview/engines/pico.mts] `setI2cDevices` remplace `_KX_I2C_ADDRS = None`). Écrire vers une adresse PRÉSENTE fonctionne. Voir [[kablix-pico-lib-injection]].
