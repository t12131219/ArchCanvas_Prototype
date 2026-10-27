"""Independent project fixture. Never executed by the source adapter."""
from library import create_core
from library.parts import Assembly


def build(width=7):
    shared = create_core(width)
    model = Assembly(shared)
    return model
