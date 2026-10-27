"""Independent dynamic dispatch fixture; never tailored to an external model."""
import torch
from torch import nn


class DynamicGate(nn.Module):
    def __init__(self, width=4):
        super().__init__()
        self.projection = nn.Linear(width, width)

    def forward(self, x, positive=True):
        operation = getattr(self, 'projection')
        value = operation(x)
        return torch.relu(value) if positive else torch.sigmoid(value)
