"""Static source examples for route refinement beside retained boundaries."""
import torch
from torch import nn


class LayeredPatch(nn.Module):
    def adjust(self, x):
        a = torch.sin(x)
        b = torch.cos(x)
        return a * b + x

    def forward(self, x, width):
        x.add_(1)
        value = self.adjust(x)
        return value.reshape(width, -1).contiguous()


class UnknownPatch(nn.Module):
    def adjust(self, x):
        return torch.sin(x) * torch.cos(x) + x

    def forward(self, x, width):
        x.add_(1)
        value = self.adjust(x)
        shape = external_unresolved(width)
        return value.reshape(shape, -1).contiguous()


class ConditionalPatch(nn.Module):
    def forward(self, x, width, flag):
        x.add_(1)
        if flag:
            return x.reshape(width, -1).contiguous()
        return x.transpose(0, 1).contiguous()


class StatePatch(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = nn.GRUCell(4, 4)

    def forward(self, x, width, previous):
        x.add_(1)
        state = self.cell(x, previous)
        return state.reshape(width, -1).contiguous(), state


class SharedPatch(nn.Module):
    def __init__(self):
        super().__init__()
        self.adjust = nn.Linear(4, 4)

    def forward(self, x, width):
        left = self.adjust(x)
        right = self.adjust(x)
        x.add_(1)
        return (left + right).reshape(width, -1).contiguous()


class ReadFragment(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('shift', torch.ones(4))

    def forward(self, x):
        offset = self.shift.to(x)
        return torch.cos(x + offset * offset)


class SummarizedPatch(nn.Module):
    def __init__(self):
        super().__init__()
        self.read = ReadFragment()

    def forward(self, x, width, signal):
        side = self.read(signal)
        x.add_(1)
        return x.reshape(width, -1).contiguous() + side
