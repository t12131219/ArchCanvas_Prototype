from torch import nn as layers


def create_core(width):
    projection = layers.Linear(width, width)
    return projection
